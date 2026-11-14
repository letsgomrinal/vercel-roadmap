# 04 · Storage: Blob, Postgres, Redis, Edge Config

**Goal:** know which store to use and wire each one up.
**Time:** 1 day.

## 1. Decision table

| Data | Use | Provisioned via |
|---|---|---|
| Relational data (users, orders) | **Postgres**: Neon (default choice), Supabase, Prisma Postgres, AWS Aurora/DSQL | Marketplace |
| Cache, sessions, rate limits, leaderboards | **Redis**: Upstash | Marketplace |
| Files: images, PDFs, uploads, exports, model artifacts | **Vercel Blob** (public or private store) | Vercel native |
| Feature flags, kill switches, allow/block lists, read-heavy config | **Edge Config** | Vercel native |
| Vectors | Neon `pgvector`, Upstash Vector, or other Marketplace providers | Marketplace |
| Messages / background jobs | Vercel Queues (Module 05) | Vercel native |

Provisioning pattern (the same for all of them):

```bash
vercel install neon                  # Marketplace integration from the terminal
# or Dashboard → Storage → Create → pick provider → connect to project + environments
vercel env pull                      # credentials now in .env.local
```

When you connect a store to a project, the credentials are injected as **env vars per environment**.
Give Preview its own database or branch. Neon branching is ideal for this: one DB branch per preview deployment.

## 2. Postgres (Neon)

```bash
pnpm add @neondatabase/serverless drizzle-orm
pnpm add -D drizzle-kit
```

```ts
// lib/db.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
export const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);

// usage in a route
const rows = await sql`select id, title from documents where owner = ${userId} limit 20`;
```

- Use the **pooled** connection string for functions. Fluid compute reuses instances, so a module-level client works well.
- Run migrations in the **build step** or a CI job, not at request time.
- Platform tip: turn on the Neon integration's **preview branching** so every PR gets an isolated copy.

## 3. Redis (Upstash)

```ts
import { Redis } from '@upstash/redis';
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,        // check the exact names injected in Project → Env Vars
  token: process.env.KV_REST_API_TOKEN!,
});

await redis.set(`session:${id}`, data, { ex: 3600 });
```

Rate limiting: use `@upstash/ratelimit`, or Vercel Firewall's rate-limit rules / `@vercel/firewall` (Module 07).

## 4. Vercel Blob

Two kinds of store:

| | Public store | Private store (GA Jun 2026) |
|---|---|---|
| URL | `https://<id>.public.blob.vercel-storage.com/...` (readable by anyone with the URL) | `https://<id>.private.blob.vercel-storage.com/...` (needs auth) |
| Use for | Marketing images, public assets | User uploads, documents, anything sensitive. **Default to this for enterprise apps.** |
| Read | Plain URL | `get()` server-side, or `presignUrl()` for a short-lived link |

Auth: on Vercel the SDK uses **OIDC** automatically (connecting the store adds `BLOB_STORE_ID`).
Off Vercel, use `BLOB_READ_WRITE_TOKEN`. Requires `@vercel/blob` ≥ 2.3 (≥ 2.6.1 for `useCache: false`).

```bash
vercel blob create-store acme-docs --access private --yes
pnpm add @vercel/blob
```

### Server-side upload (small files only: under the 4.5 MB body limit)

```ts
import { put } from '@vercel/blob';
const blob = await put(`users/${userId}/${file.name}`, file, {
  access: 'private',
  addRandomSuffix: true,
});
// blob.pathname, blob.url, blob.etag
```

### Serve a private file from an authenticated route

```ts
// app/api/files/[...path]/route.ts
import { get } from '@vercel/blob';

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser(req);                      // YOUR auth check, in the handler
  const pathname = (await params).path.join('/');
  if (!pathname.startsWith(`users/${user.id}/`)) return new Response('Forbidden', { status: 403 });

  const result = await get(pathname, { access: 'private' });
  if (result?.statusCode !== 200) return new Response('Not found', { status: 404 });

  return new Response(result.stream, {
    headers: {
      'Content-Type': result.blob.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
```

Or hand out a short-lived link with `presignUrl(pathname, { validUntil, operation: 'get' })`.

### Large uploads: client uploads (browser → Blob directly)

Your function only issues a scoped token. The bytes never pass through it, so the 4.5 MB limit doesn't apply.

```ts
// app/api/upload/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  const json = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      const user = await requireUser(request);
      return {
        allowedContentTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        maximumSizeInBytes: 200 * 1024 * 1024,
        tokenPayload: JSON.stringify({ userId: user.id }),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      // Called by Vercel when the upload finishes. Enqueue processing here (Module 05).
    },
  });
  return Response.json(json);
}
```

```tsx
// client
import { upload } from '@vercel/blob/client';
const blob = await upload(file.name, file, { access: 'private', handleUploadUrl: '/api/upload' });
```

> Verify that `access: 'private'` is supported for client uploads in your SDK version
> (https://vercel.com/docs/vercel-blob/client-upload). Older versions only allowed `public`.

Gotchas:
- Overwrites can take **up to 60s** to propagate through the CDN cache. Use `useCache: false` for read-after-write.
- Use **conditional writes** (`ifMatch` with an ETag) for concurrent editors.
- Don't serve >100 MB files through private stores at high traffic.
- Don't use `s-maxage` on private responses.

## 5. Edge Config

A globally replicated, read-optimised JSON store. Reads take about 1 ms. Writes go through the API/dashboard and are slow-ish (seconds).

```ts
import { get } from '@vercel/edge-config';
const maintenance = await get<boolean>('maintenanceMode');
```

Use it for feature flags, kill switches, IP allowlists and redirect maps. **Don't** use it as a database.
Pair with the Flags SDK (`flags` package) for typed feature flags with Vercel Toolbar overrides.

## Lab 4.1: "Doc vault" mini app

1. Create a Neon DB + private Blob store, connect both to the project (Production and Preview).
2. Table `documents(id, owner, pathname, size, created_at)`.
3. Client-upload a PDF → `onUploadCompleted` inserts a row.
4. List the user's documents. Download goes through the authenticated `/api/files/...` route.
5. Add an Edge Config flag `uploadsEnabled` and check it in the upload route.

You'll reuse this in the Capstone.

## Checkpoint

1. Why should user documents go in a private store even if URLs are "unguessable"?
2. A user uploads a file and immediately downloads it, but gets the old version. Why, and what's the fix?
3. Where should DB migrations run?
4. Feature flag vs DB row: when is Edge Config the right home?
