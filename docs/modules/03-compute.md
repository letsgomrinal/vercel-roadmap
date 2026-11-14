# 03 · Compute: Functions, Runtimes, Routing, Config

**Goal:** control how and where your code runs.
**Time:** 1 day.

## 1. Vercel Functions

A function is any server-side entrypoint: a Next.js route handler, a file in `/api`, a FastAPI app, and so on.

### Node / TypeScript (framework-less)

```ts
// api/hello.ts
export function GET(request: Request) {
  return Response.json({ hello: 'world', region: process.env.VERCEL_REGION });
}
```

### Next.js route handler

```ts
// app/api/hello/route.ts
export const maxDuration = 60;            // seconds, per route
export async function GET() {
  return Response.json({ ok: true });
}
```

### Python (GA since Oct 2026)

FastAPI, Flask and Django are auto-detected. `uv` and `pyproject.toml` are supported.

```python
# main.py
from fastapi import FastAPI
app = FastAPI()

@app.get("/api/health")
def health():
    return {"ok": True}
```

Deploy with `vercel`. That's it. Python bundles can be up to 500 MB (vs 250 MB for Node).

### Doing work after the response

```ts
import { waitUntil } from '@vercel/functions';

export async function POST(req: Request) {
  const body = await req.json();
  waitUntil(sendAnalytics(body));        // runs after response, same invocation
  return Response.json({ received: true });
}
```

Use `waitUntil` only for small best-effort tasks. Anything that must not be lost goes to a **Queue** (Module 05).

## 2. Limits you must memorize

From https://vercel.com/docs/functions/limitations (Fluid compute):

| | Hobby | Pro | Enterprise |
|---|---|---|---|
| Default max duration | 300s | 300s | 300s |
| Max duration | 300s | 800s | 800s |
| Extended max (Beta, Node/Python/Bun) | — | 1800s | 1800s |
| Memory / CPU | 2 GB / 1 vCPU | up to 4 GB / 2 vCPU | up to 4 GB / 2 vCPU |

| Limit | Value |
|---|---|
| Request/response body | **4.5 MB** (streamed responses exempt). Returns 413 `FUNCTION_PAYLOAD_TOO_LARGE`. |
| Bundle size (uncompressed) | 250 MB (Python 500 MB). "Large functions" Beta up to 5 GB with `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`. |
| File descriptors | 1,024 shared across concurrent executions |
| Edge runtime | must start responding within 25s, can stream up to 300s |

> **Design implication:** the 4.5 MB body limit means **file uploads must go directly to Blob from the
> browser** (client uploads, Module 04), not through your function.

## 3. Runtime choice

| Runtime | Use when |
|---|---|
| **Node.js** (default) | Almost everything. Full Node APIs and npm ecosystem. |
| **Bun** | You want Bun's speed/APIs. Set in `vercel.json` (`"bunVersion"`) or project settings. |
| **Python** | Data/ML teams, FastAPI services, Django apps. |
| **Edge** | Tiny, latency-critical logic close to users. Limited APIs. Vercel now generally recommends Node on Fluid instead. |
| **Go / Rust / Ruby** | Community/official runtimes. Fine for specific services. |
| **Container** | You need system packages or a non-supported runtime. Use Services/Daemons (Module 06). |

## 4. Regions

Functions run in **one region by default** (`iad1`, Washington DC, unless changed).
**Put compute next to your database, not next to your users.** A function in Sydney calling a DB in Virginia is slow.

```json
{ "regions": ["fra1"] }
```

Multi-region and failover regions are available on paid plans (`"functionFailoverRegions"` on Enterprise).

## 5. Project configuration: `vercel.json` vs `vercel.ts`

`vercel.json` (static):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["iad1"],
  "functions": {
    "app/api/report/route.ts": { "maxDuration": 800, "memory": 3009 },
    "api/**/*.py": { "maxDuration": 120 }
  },
  "rewrites": [{ "source": "/docs/:path*", "destination": "https://docs.acme.com/:path*" }],
  "redirects": [{ "source": "/old", "destination": "/new", "permanent": true }],
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "X-Frame-Options", "value": "DENY" }] }
  ],
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }]
}
```

`vercel.ts` (programmatic, introduced Dec 2025). It runs at build time, so you can compute config:

```ts
// vercel.ts
import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  regions: [process.env.PRIMARY_REGION ?? 'iad1'],
  rewrites: [routes.rewrite('/api/(.*)', 'https://backend.acme.com/$1')],
  crons: [{ path: '/api/cron/cleanup', schedule: '0 3 * * *' }],
};
```

- `npm i @vercel/config`. Import from the versioned path `@vercel/config/v1`.
- **The build fails if both `vercel.json` and `vercel.ts` exist.** Pick one.
- Platform tip: `vercel.ts` lets you ship an internal package (`@acme/vercel-presets`) with org defaults
  (security headers, regions, crons) that every project imports. This is a strong paved-road lever.

## 6. Routing middleware

- **Next.js 16+:** `middleware.ts` was renamed to **`proxy.ts`**. Same idea: code that runs before routing.
- **Any framework:** Vercel Routing Middleware (`middleware.ts` at the project root) can rewrite, redirect or set headers.
- **Don't do authorization only in middleware.** Verify auth inside the route handler too. Vercel's own
  Blob docs warn about this.

## 7. Caching (short version)

- Static assets are cached on the CDN automatically.
- For function responses, set `Cache-Control: s-maxage=60, stale-while-revalidate=300` to cache at the edge.
- Next.js ISR / `revalidateTag` / cache components are handled natively.
- `Vercel-CDN-Cache-Control` lets you target Vercel's CDN without affecting browsers or other CDNs.
- **Never put `s-maxage` on per-user or private responses.**

## Lab 3.1

1. Add `api/slow.ts` that sleeps 70s. Deploy. Watch it time out at your configured default, then set
   `maxDuration: 120` and redeploy.
2. Add a FastAPI `main.py` next to a static `index.html` and deploy. Confirm both work.
3. Convert your `vercel.json` to `vercel.ts` and make the region come from an env var.
4. Set the project region to the region of the DB you'll create in Module 04.

## Checkpoint

1. A user wants to upload 50 MB videos through `/api/upload`. What breaks and what's the fix?
2. Your Neon DB is in `aws-eu-central-1`. Which Vercel region should the functions use?
3. Can you have both `vercel.json` and `vercel.ts`?
4. What's the max duration on Pro without the Beta extension?
