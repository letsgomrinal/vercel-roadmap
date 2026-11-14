# 05 · Async Work: Cron, Queues, Workflow, Daemons

**Goal:** handle everything that isn't request/response. This is what makes "real" apps work.
**Time:** 1–2 days.

## 1. Which one do I use?

```
Does it run on a schedule?                         → Cron Job (→ "Schedules")
Is it "do this later / in the background, reliably", or fan-out?
                                                   → Queue
Is it multi-step, long (minutes → months), needs retries per step,
waits for humans/webhooks, must survive deploys?   → Workflow
Is it an always-on process pulling work (Celery, BullMQ, Temporal worker, CI runner)?
                                                   → Daemon
Is it tiny, best-effort, after the response?       → waitUntil()
```

| | Cron | Queues | Workflow | Daemons |
|---|---|---|---|---|
| Status (Nov 2026) | GA (legacy → Schedules) | **Public Beta** (Feb 2026) | Check docs (JS core in docs, Python Beta) | **Public Beta** (Oct 2026) |
| Trigger | Time (UTC) | Message published | Code starts a run | Always running |
| Retries | **None** | Automatic until TTL / `maxDeliveries` | Per step (default 3 retries) | Process restarts |
| Delivery | Best effort, may miss or duplicate | At-least-once | Durable, replayed | n/a |
| Billing | Function invocation | Per API op ($0.60/1M) + function time | Workflow pricing + function time | Fluid compute instances |

## 2. Cron Jobs

```json
{
  "crons": [
    { "path": "/api/cron/cleanup", "schedule": "0 3 * * *" },
    { "path": "/api/cron/sync",    "schedule": "*/5 * * * *" }
  ]
}
```

```ts
// app/api/cron/cleanup/route.ts
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... do cleanup, ideally just enqueue work items
  return Response.json({ ok: true });
}
```

- Set `CRON_SECRET` (16+ random chars). Vercel sends it as `Authorization: Bearer ...`.
- **UTC only**, **production only**, **no retries**, may be missed or duplicated. Make jobs idempotent.
- Limits: 100 per project. Hobby: once a day max (±59 min). Pro/Ent: once a minute.
- **Pattern:** keep the cron handler thin. It enqueues messages, and Queue consumers do the work with retries.

## 3. Vercel Queues (Public Beta)

A durable event-streaming system: **topics**, **consumer groups**, at-least-once delivery.

```bash
pnpm add @vercel/queue
vercel link && vercel env pull     # OIDC creds for local dev
```

### Publish

```ts
import { send } from '@vercel/queue';

export async function POST(req: Request) {
  const order = await req.json();
  const { messageId } = await send('orders', order);   // optional { region: 'fra1' }
  return Response.json({ messageId });
}
```

### Consume (push mode, the default)

```ts
// app/api/queues/fulfill-order/route.ts
import { handleCallback } from '@vercel/queue';

export const POST = handleCallback(
  async (order, metadata) => {
    await fulfillOrder(order);                  // throw → message is redelivered
  },
  {
    retry: (error, metadata) => {
      if (metadata.deliveryCount > 10) return { acknowledge: true };   // give up (your own DLQ logic)
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
  },
);
```

```json
// vercel.json
{
  "functions": {
    "app/api/queues/fulfill-order/route.ts": {
      "experimentalTriggers": [
        {
          "type": "queue/v2beta",
          "topic": "orders",
          "retryAfterSeconds": 60,
          "maxDeliveries": 20,
          "maxConcurrency": 10
        }
      ]
    }
  }
}
```

### Python

```python
from vercel.queue import send, subscribe, Message

await send("orders", {"id": 123})

@subscribe(topic="orders")
async def fulfill(message: Message[dict]) -> None:
    ...
```

```toml
# pyproject.toml
[[tool.vercel.subscribers]]
entrypoint = "queues.orders"
```

### Semantics you must design for

- **At-least-once.** Consumers must be idempotent (use `metadata.messageId` or a business key).
- **Not FIFO.** Ordering is approximate, and retries are deprioritised.
- **Each route file subscribed to a topic is its own consumer group** and gets every message (fan-out for free).
- Consumers have **no public URL**. Only Vercel's queue infra can invoke them.
- **No built-in DLQ.** Implement one in `retry` (write to a `failed_jobs` table, alert).
- TTL per message is 60s to 7 days (default 24h). Delays of 0s to 7 days are allowed. Default visibility timeout is 60s.
- Topics are **partitioned per deployment by default**. A new deployment's consumers handle messages
  sent by that deployment. Deleting a deployment stops its consumers.
- A timed-out delivery is billed at the function's full `maxDuration`. Set `maxDuration` sensibly.
- **Poll mode** exists for workers outside push functions (e.g. a Daemon). See `/docs/queues/poll-mode`.
- Queues live per region (all 19 regions). Multi-region means multiple queues.

## 4. Workflow (`workflow` package / Workflow SDK)

Durable execution: a workflow function is **replayed from an event log**, so it survives crashes and
deploys and can sleep for days at no compute cost.

```bash
pnpm add workflow
```

```ts
// workflows/onboard.ts
import { sleep, FatalError } from 'workflow';

export async function onboardCustomer(customerId: string) {
  'use workflow';                                   // deterministic orchestrator
  const account = await provisionAccount(customerId);
  await sendWelcomeEmail(account.email);
  await sleep('3 days');                            // no compute while sleeping
  const active = await checkActivity(customerId);
  if (!active) await sendNudge(account.email);
  return { done: true };
}

async function provisionAccount(id: string) {
  'use step';                                       // retried automatically (default 3 retries)
  const res = await fetch(`https://crm.internal/accounts/${id}`, { method: 'POST' });
  if (res.status === 400) throw new FatalError('bad input');   // don't retry
  return res.json();
}
// sendWelcomeEmail, checkActivity, sendNudge are also 'use step' functions
```

Human-in-the-loop with hooks:

```ts
import { defineHook } from 'workflow';
export const approval = defineHook<{ decision: 'approved' | 'rejected' }>();

// inside a 'use workflow' function:
const events = approval.create({ token: `deploy-${requestId}` });
for await (const e of events) { if (e.decision === 'approved') break; }

// from an API route, after YOU authenticate the approver:
await approval.resume(`deploy-${requestId}`, { decision: 'approved' });
```

Rules:
- Workflow functions must be **deterministic**. All I/O goes in `'use step'` functions.
- Runs stay pinned to the deployment that started them. Rolling back doesn't stop old runs, so cancel via dashboard/CLI.
- A hook token routes a payload; **it does not authenticate the sender**. Authorize before `resume`.
- The framework integration differs per framework (Next.js plugin etc.). Follow https://vercel.com/docs/workflows for setup.
  Python is Beta.

**Queue vs Workflow:** a Queue moves *messages*. A Workflow orchestrates *processes*. Many apps use both:
Queue consumer → starts a Workflow run per item.

## 5. Vercel Daemons (Public Beta, Oct 2026)

Long-running containers on Fluid compute, in the same project, that **pull** work. They need no HTTP server.

```json
{
  "daemons": {
    "worker": {
      "root": "worker/",
      "entrypoint": "Dockerfile",
      "command": ["celery", "-A", "tasks", "worker", "--loglevel=info"],
      "instances": { "iad1": 2 }
    }
  }
}
```

- Vercel builds the image from your Dockerfile and keeps `instances` running per region. It restarts them on crash.
- Use for Celery/Dramatiq/BullMQ/RabbitMQ/Kafka consumers, Temporal workers, self-hosted CI runners,
  or Queues in **poll mode**.
- Put connection details in production env vars. CPU/mem metrics need Observability Plus.
- Bring teams' existing worker code over without rewriting it as push functions.

## Lab 5.1

1. Cron (`*/5 * * * *` on Pro) → enqueue `cleanup` messages for documents older than 30 days.
2. Queue consumer deletes the Blob and the DB row. It is idempotent (handles "already deleted").
3. Make the consumer throw on every 3rd message and watch redeliveries in **Queues → Observability**.
4. Write a Workflow: on upload → extract text (step) → summarize with AI (step) → wait for reviewer
   approval (hook) → mark published (step).

## Checkpoint

1. Your cron job failed at 03:00. Will Vercel retry it?
2. Two route files subscribe to `orders`. How many times is each message processed?
3. Why must a `'use workflow'` function not call `fetch` directly?
4. A team has an existing Celery worker. What's the least-effort way to run it on Vercel?
