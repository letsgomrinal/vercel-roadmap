# Roadmap & Progress

> Researched against Vercel docs, changelog and the Ship 2026 recap as of **14 Nov 2026**.
> Vercel ships fast. Everything marked **Beta** may change, so check the linked doc before you rely on it.

Tick off modules as you finish them. You can also use the **Mark complete** button at the bottom of each module.

<RoadmapProgress />

## Who this is for

You are the platform engineer. Your job is to let your organization ship applications on Vercel
(agents come later). You have two kinds of users:

| User | Has GitHub? | How they should deploy |
|---|---|---|
| Engineers | Yes | Git push → Preview → Production. Standard Vercel flow. |
| Business / non-technical builders | No | A **paved road** you build: v0, templates, or an **MCP server** that wraps the Vercel REST API with guardrails. |

The curriculum teaches you the platform end-to-end first. Then it teaches you to build the paved road.

## Suggested schedule

| Week | Modules | Outcome |
|---|---|---|
| 1 | 01–02 | Explain what happens between `git push` and a live URL. Deploy, set env vars, attach a domain, roll back. |
| 2–3 | 03–06 | Wire compute, storage, background work and multi-service apps. |
| 4 | 07–08 | Lock down access, reach AWS without keys, ship with rolling releases. |
| 5–6 | 09–11 | Deploy from code, run your MCP paved road, ship the capstone. |

## Prerequisites

- Node.js 22+ (24 recommended), `pnpm` or `npm`. Python 3.12+ and `uv` for the Python parts.
- A Vercel account. **For org use you need Pro or Enterprise.** Hobby is for non-commercial, personal use only.
  Several governance features in Module 07 (SAML SSO, SCIM, Trusted IPs, BYOC) are Enterprise or paid add-ons.
- The CLI: `npm i -g vercel`, then `vercel login`.
- Optional: `gh` CLI, Docker (for Module 06), an AWS account (for Module 07's OIDC lab).

## How to study

1. Do every **Lab** block. Reading about Vercel teaches you little; deploying teaches you a lot.
2. Keep one scratch team (e.g. `acme-sandbox`) separate from production teams.
3. After each module, answer its **Checkpoint** questions without looking.
4. Build your org's paved road (Module 10) only after Modules 01–09.
   You can't put guardrails around something you don't understand.

## The one-page mental model

```
             ┌───────────────── Team (billing, RBAC, SSO, Firewall policies) ─────────────────┐
             │                                                                                 │
  Git push ──┤  Project  ── Environments: Production | Preview | Development | Custom          │
  CLI      ──┤     │                                                                           │
  REST API ──┤     ├── Deployment (immutable, own URL)  ◄── build: framework detect → output  │
  MCP      ──┤     │       ├── Static assets  ──► Global CDN                                   │
             │     │       ├── Functions (Fluid compute: Node, Python, Bun, Go, Rust...)       │
             │     │       ├── Services (multi-service, Beta) / Containers / Daemons (Beta)    │
             │     │       └── Routing (rewrites, redirects, headers, middleware/proxy)        │
             │     ├── Domains ──► alias to a deployment (that's what "promote" means)         │
             │     ├── Env vars / secrets (per environment, injected at build + runtime)       │
             │     └── Connected stores: Blob, Edge Config, Marketplace (Neon, Upstash, ...)   │
             │                                                                                 │
             │  Async: Cron (→ Schedules) · Queues (Beta) · Workflow · Daemons (Beta)           │
             │  AI: AI Gateway · AI SDK · Sandbox · Connect · eve                              │
             └─────────────────────────────────────────────────────────────────────────────────┘
```

Remember one idea above all: **a deployment is immutable and has its own URL.** "Going live" just
points a domain at a deployment. "Rolling back" points it at an older one. Most of Vercel follows from that.

## Key sources

- Docs home: [vercel.com/docs](https://vercel.com/docs)
- Changelog: [vercel.com/changelog](https://vercel.com/changelog)
- Ship 2026 recap: [vercel.com/blog/vercel-ship-2026-recap](https://vercel.com/blog/vercel-ship-2026-recap)
- REST API: [vercel.com/docs/rest-api](https://vercel.com/docs/rest-api) · [OpenAPI spec](https://vercel.com/openapi.json)
- Vercel MCP: [vercel.com/docs/agent-resources/vercel-mcp](https://vercel.com/docs/agent-resources/vercel-mcp)
- Queues: [vercel.com/docs/queues](https://vercel.com/docs/queues)
- Blob private storage: [vercel.com/docs/vercel-blob/private-storage](https://vercel.com/docs/vercel-blob/private-storage)
- Services: [vercel.com/docs/services](https://vercel.com/docs/services)
- Functions limits: [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations)
- OIDC: [vercel.com/docs/oidc](https://vercel.com/docs/oidc)
