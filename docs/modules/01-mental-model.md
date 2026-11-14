# 01 · The Vercel Mental Model

**Goal:** know the nouns and how they relate before you touch anything.
**Time:** 1–2 hours.

## 1. The object hierarchy

| Object | What it is | Why you care as a platform engineer |
|---|---|---|
| **Team** | Billing, members, roles, SSO, firewall policies, shared env vars | Your unit of isolation. Consider one team per business unit or sensitivity tier. |
| **Project** | One app (or one multi-service app) with settings, env vars, domains and connected stores | What a user "owns". Projects can link to a Git repo, but don't have to. |
| **Deployment** | An immutable build of the project. It has a unique URL like `proj-abc123-team.vercel.app`. | Every push or `vercel deploy` makes a new one. Old ones stay addressable. |
| **Environment** | `Production`, `Preview`, `Development`, plus **Custom** environments (e.g. `staging`) | Each has its own env vars and its own domain behaviour. |
| **Domain / alias** | A hostname pointing at a deployment | "Promote" and "rollback" just move this pointer. |

### How a deployment happens

```
source (git commit | CLI upload | REST files)
   │
   ▼
Build container ── installs deps, detects framework (Next.js, Vite, FastAPI, ...)
   │                runs build, produces "Build Output" (static files + function bundles + routes)
   ▼
Deployment created (immutable)  ──►  preview URL (always)
   │
   └── if target = production ──► production domains re-aliased to it
```

**Framework-defined infrastructure:** you don't write infrastructure-as-code for the common case.
Vercel reads your framework's output and decides what is static (CDN), what is a function,
and what is cached (ISR). For non-framework cases you configure `vercel.json` / `vercel.ts` (Module 03).

## 2. Preview vs Production

- **Every branch or PR gets a Preview deployment** with its own URL. Stakeholders review real
  running software, not screenshots. Expect this to be your biggest win with business users.
- **Production** is whatever your production domains point at.
- Preview deployments use **Preview** env vars. Never point previews at your production database.
- Previews are protected by **Vercel Authentication** by default on new projects (Module 07).

## 3. Compute: Fluid compute

Vercel Functions run on **Fluid compute**, the default for new projects:

- **Many requests share one instance** (in-function concurrency), like a server. This is unlike classic
  one-request-per-Lambda. It suits AI workloads that mostly wait on I/O (LLM calls).
- **Billing = Active CPU + provisioned memory.** CPU billing pauses while your code waits on I/O.
- **Long durations.** The default is 300s on all plans. Pro/Enterprise can go to 800s, and to 1800s in Beta (Module 03).
- You can still use `waitUntil` to finish work after the response is sent.

Fluid compute changes the economics for streaming and LLM calls. Waiting 40s on a model response
costs you memory-time, not CPU-time.

## 4. The capability map: "my app needs X"

| Need | Vercel primitive | Status (Nov 2026) |
|---|---|---|
| Frontend / SSR | Framework on Vercel (Next.js, SvelteKit, Nuxt, Astro, Vite...) | GA |
| HTTP API | Vercel Functions (Node, Bun, Python, Go, Rust, Ruby) | GA (Python GA Oct 2026) |
| Polyglot / multiple backends | **Services** (`services` in vercel.json) | Beta |
| Arbitrary container | Container runtime (`"runtime": "container"` / Dockerfile) | Beta via Services/Daemons |
| Relational DB | Marketplace: Neon, Supabase, Prisma Postgres, AWS (Aurora/DSQL), ... | GA (partner-run) |
| Cache / KV / rate limit | Marketplace: Upstash Redis | GA (partner-run) |
| Files / objects | **Vercel Blob** (public or private stores) | GA (private GA Jun 2026) |
| Feature flags / config at the edge | **Edge Config**, Vercel Flags | GA |
| Scheduled jobs | **Cron Jobs** (migrating to "Schedules") | GA |
| Background jobs / fan-out | **Vercel Queues** | Public Beta |
| Long-running multi-step processes | **Workflow** (`workflow` package, `"use workflow"`) | Check docs |
| Always-on workers (Celery, BullMQ, Temporal...) | **Vercel Daemons** | Public Beta (Oct 2026) |
| Run untrusted / AI-generated code | **Vercel Sandbox** (+ Drives for persistence) | GA (Drives GA Oct 2026) |
| LLM access, budgets, fallbacks | **AI Gateway** | GA |
| Internal-app SSO with your IdP | **Vercel Passport** | GA (Jul 2026) |
| Run functions in your AWS account | **Bring Your Own Cloud (AWS)** | GA (Enterprise) |

**Marketplace** storage is run by partners (Neon, Upstash, Supabase...) but provisioned and billed
through Vercel. Credentials are injected as env vars automatically. The old `@vercel/postgres` and
`@vercel/kv` products moved to Neon and Upstash.

## 5. Where Vercel is *not* the right answer

Know these so you can tell your org honestly:

- **Heavy stateful infra you'd normally run in K8s** (Kafka clusters, big self-hosted DBs). Use a managed
  provider via Marketplace, or keep it in your cloud and connect with OIDC (Module 07).
- **Very long CPU-bound batch jobs** (hours of compute). Use Workflow (durable steps) or your cloud.
  Daemons help, but check limits.
- **Strict data-residency needs.** Check regions and BYOC (Enterprise) before you promise anything.

## Checkpoint

1. A user says "I deployed but my change isn't live". Which two objects do you check?
2. What does "rollback" actually change?
3. Why is Fluid compute cheaper than classic serverless for an endpoint that streams an LLM response?
4. Your app needs file uploads, a nightly cleanup job and an email sent after signup. Name the three primitives.

<details><summary>Answers</summary>

1. The latest **deployment** (did it build, which target?) and the **domain alias** (does production point at it?).
2. Only the domain alias. It points production at an older immutable deployment. Nothing is rebuilt.
3. Active-CPU billing pauses during I/O waits, and one instance serves many concurrent requests.
4. Blob, Cron Job, Queue (or `waitUntil` for trivial cases).
</details>
