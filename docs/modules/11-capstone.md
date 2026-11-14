# 11 · Capstone: "Doc Intake", a Production-Shaped App

**Goal:** use most of the platform in one app, then ship it through your own paved road.
**Time:** 2–3 days.

## What you're building

Employees upload contracts/invoices (PDF). The app stores them privately, summarizes them with AI in the
background, lets a reviewer approve, and purges old files nightly.

```
Browser ──(Passport SSO)──► Next.js (web)
  │  client upload (direct, large files OK)
  ▼
Private Blob store ──onUploadCompleted──► send('doc.uploaded')
                                                │
                                    Queue consumer (retries, idempotent)
                                                │ starts
                                    Workflow: summarize (AI Gateway) → wait for approval (hook) → publish
                                                │
                                        Neon Postgres (documents, summaries, audit)
Cron 03:00 UTC ──► enqueue purge messages ──► consumer deletes blob + rows
Edge Config: uploadsEnabled kill switch · OTel + drains · rolling releases
```

| Concern | Primitive | Module |
|---|---|---|
| Auth | Vercel Passport (`x-vercel-oidc-passport-token`) | 07 |
| Files | Private Blob + client uploads | 04 |
| DB | Neon via Marketplace, preview branching | 04 |
| Background | Queues (`doc.uploaded`, `doc.purge`) | 05 |
| Long process + human approval | Workflow + hook | 05 |
| AI | AI SDK + AI Gateway (OIDC, no key in code) | 13 |
| Schedule | Cron + `CRON_SECRET` | 05 |
| Kill switch | Edge Config | 04 |
| Ops | OTel, drains, rolling release, rollback | 08 |

## Step 1: Scaffold & provision

```bash
npx create-next-app@latest doc-intake --ts --app && cd doc-intake
pnpm add @vercel/blob @vercel/queue @vercel/edge-config @vercel/otel workflow ai zod \
         @neondatabase/serverless drizzle-orm jose
vercel link
vercel install neon                                   # connect to Production + Preview
vercel blob create-store doc-intake-files --access private --yes   # then connect to project
# Dashboard → Storage → Edge Config → create, add {"uploadsEnabled": true}, connect
vercel env add CRON_SECRET production --type secret
vercel env pull
```

Set the project region to match Neon's region (Module 03).

## Step 2: Schema

```ts
// db/schema.ts
import { pgTable, text, timestamp, integer, uuid } from 'drizzle-orm/pg-core';
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner: text('owner').notNull(),
  pathname: text('pathname').notNull().unique(),     // idempotency key for the consumer
  size: integer('size').notNull(),
  status: text('status').notNull().default('uploaded'),  // uploaded → summarized → approved
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Run `drizzle-kit migrate` in the build command (`"build": "drizzle-kit migrate && next build"`) or in CI.

## Step 3: Who is the user? (Passport)

```ts
// lib/user.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
const JWKS = createRemoteJWKSet(new URL(process.env.PASSPORT_JWKS_URL!)); // from the Passport docs/settings

export async function requireUser(req: Request) {
  const token = req.headers.get('x-vercel-oidc-passport-token');
  if (!token) throw new Response('Unauthorized', { status: 401 });
  const { payload } = await jwtVerify(token, JWKS);   // add issuer/audience checks per the docs
  return { id: String(payload.external_sub), email: String(payload.email ?? '') };
}
```

In local dev there's no Passport header, so stub `requireUser` behind `process.env.VERCEL_ENV !== 'production'`
with care, or test on previews.

## Step 4: Upload → enqueue

```ts
// app/api/upload/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { get as flag } from '@vercel/edge-config';
import { send } from '@vercel/queue';
import { requireUser } from '@/lib/user';

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  return Response.json(
    await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        if (!(await flag<boolean>('uploadsEnabled'))) throw new Error('Uploads are paused');
        const user = await requireUser(request);
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ owner: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { owner } = JSON.parse(tokenPayload!);
        await send('doc.uploaded', { pathname: blob.pathname, owner });
      },
    }),
  );
}
```

> `onUploadCompleted` is a callback from Vercel to your deployment, so it doesn't fire on `localhost`
> unless you tunnel. Test on a preview.

## Step 5: Consumer → start workflow

```ts
// app/api/queues/doc-uploaded/route.ts
import { handleCallback } from '@vercel/queue';
import { head } from '@vercel/blob';
import { start } from 'workflow/api';
import { db } from '@/lib/db';
import { documents } from '@/db/schema';
import { processDocument } from '@/workflows/process-document';

export const POST = handleCallback(async ({ pathname, owner }: { pathname: string; owner: string }) => {
  const meta = await head(pathname);
  const inserted = await db.insert(documents)
    .values({ pathname, owner, size: meta.size })
    .onConflictDoNothing()                 // redelivery → no duplicate
    .returning();
  if (inserted.length) await start(processDocument, [inserted[0].id]);
});
```

```json
// vercel.json (excerpt)
{
  "functions": {
    "app/api/queues/doc-uploaded/route.ts": {
      "experimentalTriggers": [{ "type": "queue/v2beta", "topic": "doc.uploaded", "maxDeliveries": 10 }]
    },
    "app/api/queues/doc-purge/route.ts": {
      "experimentalTriggers": [{ "type": "queue/v2beta", "topic": "doc.purge", "maxDeliveries": 5 }]
    }
  },
  "crons": [{ "path": "/api/cron/purge", "schedule": "0 3 * * *" }]
}
```

> Check the Workflow docs for how to start a run from a route in your framework. `start` from `workflow/api`
> is the documented pattern at the time of writing.

## Step 6: The workflow (AI summary + approval)

```ts
// workflows/process-document.ts
import { defineHook } from 'workflow';
import { generateText } from 'ai';
import { get } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents } from '@/db/schema';

export const reviewHook = defineHook<{ decision: 'approved' | 'rejected'; reviewer: string }>();

export async function processDocument(docId: string) {
  'use workflow';
  const summary = await summarize(docId);
  await save(docId, { status: 'summarized', summary });

  const events = reviewHook.create({ token: `review-${docId}` });
  for await (const e of events) {
    await save(docId, { status: e.decision });
    break;
  }
}

async function summarize(docId: string) {
  'use step';
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  const file = await get(doc.pathname, { access: 'private' });
  const data = new Uint8Array(await new Response(file!.stream).arrayBuffer());
  const { text } = await generateText({
    model: 'anthropic/claude-sonnet-5.5',      // AI Gateway model id: check the Gateway model list
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Summarize this document in 5 bullets. Flag payment terms and renewal dates.' },
        { type: 'file', data, mediaType: 'application/pdf' },
      ],
    }],
  });
  return text;
}

async function save(docId: string, values: Partial<typeof documents.$inferInsert>) {
  'use step';
  await db.update(documents).set(values).where(eq(documents.id, docId));
}
```

```ts
// app/api/review/route.ts
import { reviewHook } from '@/workflows/process-document';
import { requireUser } from '@/lib/user';

export async function POST(req: Request) {
  const user = await requireUser(req);
  // AUTHORIZE: is this user a reviewer? (check group claim / DB role)
  const { docId, decision } = await req.json();
  await reviewHook.resume(`review-${docId}`, { decision, reviewer: user.email });
  return Response.json({ ok: true });
}
```

The AI SDK uses AI Gateway when you pass a `"provider/model"` string. On Vercel it authenticates with OIDC,
so there's no API key in env. Locally, `vercel env pull` provides the token.

## Step 7: Cron purge

```ts
// app/api/cron/purge/route.ts
import { send } from '@vercel/queue';
import { lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents } from '@/db/schema';

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('Unauthorized', { status: 401 });
  const old = await db.select({ id: documents.id, pathname: documents.pathname })
    .from(documents).where(lt(documents.createdAt, sql`now() - interval '90 days'`));
  await Promise.all(old.map((d) => send('doc.purge', d)));
  return Response.json({ enqueued: old.length });
}
```

The `doc-purge` consumer calls `del(pathname)` (it's fine if the file is already gone) and then deletes the row.

## Step 8: Ship it like production

- [ ] Passport on, previews protected, `CRON_SECRET` set
- [ ] Neon preview branching on; Preview never touches the prod DB
- [ ] `instrumentation.ts` with `@vercel/otel`; team drain receiving logs
- [ ] Rolling release (10% → 100%); skew protection on
- [ ] Firewall rate-limit rule on `/api/upload`; BotID optional
- [ ] AI Gateway budget on the project
- [ ] Break something on purpose → `vercel rollback` → verify

## Step 9: Ship it through the paved road

Turn this app into a **`file-intake` template** for your Module 10 MCP server. Then, as a test business user, ask
Claude: *"Create a file-intake app called vendor-invoices for the finance team and deploy it."*
If that works end to end with your guardrails, you've finished the course.
