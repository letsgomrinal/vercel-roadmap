# 08 · Observability & Safe Releases

**Goal:** see what's happening and ship without fear.
**Time:** half a day.

## 1. Observability

| Tool | What | Notes |
|---|---|---|
| **Runtime Logs** | Function logs, request logs | `vercel logs <url>`; dashboard search; short retention. Use drains for long-term. |
| **Observability** tab | Per-route latency, errors, function duration, CPU, external API calls, cache hit rates | **Observability Plus** (paid) adds longer retention and more detail. |
| **Drains** | Stream logs, traces, speed insights and analytics to Datadog, Grafana, Splunk, or an HTTP endpoint | Pro+. Set at team level so every project is covered. |
| **OpenTelemetry** | `@vercel/otel` → traces exported to your backend | `instrumentation.ts` in Next.js |
| **Speed Insights** | Core Web Vitals from real users | `@vercel/speed-insights` |
| **Web Analytics** | Privacy-friendly page analytics | `@vercel/analytics` |
| **Queues observability** | Message throughput, redeliveries, lag | Queues dashboard |

```ts
// instrumentation.ts (Next.js)
import { registerOTel } from '@vercel/otel';
export function register() {
  registerOTel({ serviceName: 'doc-vault' });
}
```

Platform move: configure **team-level drains** to your central observability stack once, so new projects
are covered automatically.

## 2. Release strategies

| Technique | What it does |
|---|---|
| **Preview deployments** | Every PR is a full running copy. Use for review + E2E tests. |
| **Checks** | Integrations (or your own via API) that run against a deployment. They can **block promotion to production** until they pass. |
| **Instant rollback** | `vercel rollback`. Re-points the domain in seconds. |
| **Rolling releases** | Gradually shift production traffic to the new deployment (e.g. 5% → 25% → 100%), with metrics comparison and abort. |
| **Skew protection** | Clients keep talking to the deployment version they loaded, avoiding "new frontend / old backend" errors mid-deploy. Turn it on. |
| **Custom environments** | `staging`, `uat`... with their own env vars and domains, between preview and prod. |
| **Feature flags** | Edge Config + Flags SDK. Ship dark, enable per segment. |

Rolling release config is in Project → Settings → Rolling Releases (stages and durations), or via REST API/MCP.

## 3. A sane production pipeline

```
PR opened
  → Preview deployment (protected)
  → Checks: unit tests (CI), E2E against preview (bypass token), Lighthouse
  → Review in the preview URL (Vercel Toolbar comments for non-devs!)
merge to main
  → Production deployment build
  → Checks must pass before domains are assigned
  → Rolling release 10% → 50% → 100% over 30 min, watch error rate
  → Problem? vercel rollback (seconds)
```

**Vercel Toolbar comments**: reviewers (including business users) can comment directly on a preview page.
Comments sync to Slack/Linear/GitHub. This is great for non-technical stakeholders.

## Lab 8.1

1. Add `@vercel/otel` and `@vercel/speed-insights` to your Module 04 app.
2. Configure a team-level log drain to an HTTP endpoint (a tiny Vercel function that logs payloads works).
3. Enable rolling releases (2 stages). Ship a change and watch traffic split.
4. Ship a deliberately broken change and roll back. Time it.
5. Turn on skew protection.

## Checkpoint

1. How can you stop a deployment reaching production until E2E tests pass?
2. Rolling release vs instant rollback: when do you use each?
3. Where should logs go for 90-day retention?
