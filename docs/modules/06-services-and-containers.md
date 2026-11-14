# 06 · Services & Containers: Multi-Service Apps in One Project

**Goal:** ship a frontend, one or more backends (any language) and workers together, with atomic deploys.
**Time:** 1 day.
**Status:** Services are **Beta on all plans** (https://vercel.com/docs/services). The newer `services`
key replaces the older `experimentalServices` model for new projects.

## 1. Why Services matter for your org

Before Services, "Next.js frontend + Python API" meant two projects, two deploys, CORS, and version skew.
With Services:

- **One project, one deployment, atomic.** Frontend and backend ship and roll back together.
- **Shared previews.** Each PR previews the whole system.
- **Private service-to-service bindings.** Internal services have no public URL.
- **Logs by service.**

## 2. Declaring services

```
repo/
├── frontend/          # Next.js
├── backend/           # FastAPI (main.py → app)
├── services/
│   ├── orders/        # Node service
│   └── inventory/     # Go service, internal only
└── vercel.json
```

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "web":       { "root": "frontend/" },
    "api":       { "root": "backend/", "entrypoint": "main:app" },
    "orders":    {
      "root": "services/orders/",
      "bindings": [
        { "type": "service", "service": "inventory", "format": "url", "env": "INVENTORY_URL" }
      ]
    },
    "inventory": { "root": "services/inventory/" }
  },
  "rewrites": [
    { "source": "/api/orders/(.*)", "destination": { "service": "orders" } },
    { "source": "/api/(.*)",        "destination": { "service": "api" } },
    { "source": "/(.*)",            "destination": { "service": "web" } }
  ]
}
```

Rules:
- **A service is internal by default.** It becomes public only if a top-level rewrite targets it.
  (`inventory` above is private.)
- Per-service settings (`functions`, `buildCommand`, `installCommand`, `outputDirectory`, `framework`, ...)
  move **inside** the service. Routing stays top-level.
- **Bindings** inject the internal URL of another service as an env var (`INVENTORY_URL`).
  - Available to functions **at runtime only**, not during build or in middleware.
  - Internal calls **skip Firewall, Deployment Protection and middleware**. A binding grants reachability,
    **not authorization**. Still authenticate service-to-service calls (e.g. verify the OIDC token or a shared secret).
  - Go and Rust services don't support bindings yet.
- Local dev: `vercel dev` runs all services.

## 3. Containers

A service can run as a container instead of a framework/function build:

```json
{
  "services": {
    "renderer": { "root": "renderer/", "runtime": "container" }
  }
}
```

With a `Dockerfile` in `renderer/`. Use this when you need system packages (ffmpeg, LibreOffice, headless
Chrome), an unsupported language, or an existing containerised app.
Container services run on Fluid compute. Check https://vercel.com/docs/services for current container limits.

For **always-on** containers that pull work, use **Daemons** (Module 05) instead.

## 4. Choosing a shape for an app

| App shape | Recommended setup |
|---|---|
| Next.js full-stack | Single project, no services needed |
| Next.js + Python ML API | Services: `web` + `api` (FastAPI) |
| Frontend + several microservices | Services with private bindings |
| App + existing Celery workers | Services/app + Daemon |
| Independent teams owning separate parts of one domain | **Microfrontends** (separate projects composed under one domain), not Services |

## Lab 6.1

1. Build `frontend/` (Next.js) that calls `/api/predict`.
2. Build `backend/` (FastAPI) exposing `POST /api/predict`.
3. Add an internal `audit/` Node service bound to `backend` via `AUDIT_URL`. `backend` posts an audit event to it.
4. Deploy. Confirm `audit` has no public route, open a PR to see the full-stack preview, then roll back and watch both move together.

## Checkpoint

1. How do you make a service public?
2. A bound internal call bypasses something important. What, and what must you add?
3. When would you pick Microfrontends over Services?
