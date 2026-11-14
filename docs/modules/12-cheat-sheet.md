# 12 · Cheat Sheet

## CLI

```bash
vercel login | logout | whoami
vercel teams switch <slug>
vercel link                     # link folder → project
vercel                          # preview deploy
vercel --prod                   # production deploy
vercel deploy --prebuilt        # deploy output of `vercel build`
vercel deploy --temporary       # no account, claimable
vercel dev                      # local dev with Development env vars
vercel pull --environment=preview
vercel build --prod
vercel ls | inspect <url> | logs <url> [--query 'level:error']
vercel curl /path --deployment <url>
vercel promote <url> | rollback [<url>]
vercel env ls | add KEY <env> [--type secret] | rm KEY <env> | pull
vercel domains add <domain> | ls
vercel alias set <deployment> <domain>
vercel blob create-store <name> --access private --yes
vercel install <integration>    # e.g. neon, upstash
vercel git connect
```

## Which primitive?

| I need... | Use |
|---|---|
| SQL | Neon / Supabase / Prisma Postgres (Marketplace) |
| Cache / rate limit / sessions | Upstash Redis, or Firewall rate limiting |
| Files | Blob, **private** store for anything user-owned |
| Uploads > 4.5 MB | Blob **client uploads** |
| Flags / kill switch | Edge Config + Flags SDK |
| Run on schedule | Cron (UTC, prod only, no retries) |
| Reliable background job / fan-out | Queues (at-least-once, idempotent consumers) |
| Multi-step, long, human approval | Workflow |
| Always-on worker / existing Celery | Daemons |
| Frontend + Python API in one deploy | Services |
| System packages / Docker | Container runtime (Services/Daemons) |
| Untrusted / AI-generated code execution | Sandbox |
| LLM calls with budgets/fallbacks | AI Gateway |
| Internal app SSO, no code | Passport |
| Reach AWS/GCP without keys | OIDC federation |

## Limits (Fluid compute, Nov 2026)

| | Value |
|---|---|
| Function duration default | 300s (all plans) |
| Function duration max | Hobby 300s · Pro/Ent 800s · 1800s Beta |
| Memory | 2 GB/1 vCPU default · 4 GB/2 vCPU max (Pro/Ent) |
| Body size | 4.5 MB (streaming exempt) |
| Bundle | 250 MB (Python 500 MB); large functions Beta 5 GB |
| Env vars | 64 KB total per deployment |
| Cron | 100/project; Hobby daily only |
| Queue message TTL | 60s – 7 days (default 24h) |
| Queues pricing | from $0.60 / 1M operations |
| OIDC token TTL (functions) | 2h |

## Key `vercel.json` keys

```
$schema, regions, functions{ <glob>: { maxDuration, memory, experimentalTriggers[] } },
rewrites, redirects, headers, cleanUrls, trailingSlash,
crons[{ path, schedule }],
services{ <name>: { root, entrypoint, runtime, bindings[], functions, buildCommand, framework } },
daemons{ <name>: { root, entrypoint, command[], instances{ region: n } } },
git{ deploymentEnabled }, buildCommand, installCommand, outputDirectory, framework
```

## Important env vars Vercel sets

`VERCEL=1`, `VERCEL_ENV` (production|preview|development), `VERCEL_URL`, `VERCEL_BRANCH_URL`,
`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_REGION`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`,
`VERCEL_OIDC_TOKEN` (build), `x-vercel-oidc-token` header (runtime).

## REST quick reference

```
POST /v2/files                        upload (x-vercel-digest: sha1)
POST /v13/deployments                 create deployment
GET  /v13/deployments/:id             status
GET  /v6/deployments                  list
POST /v11/projects                    create project
POST /v10/projects/:id/env            add env var
POST /v10/projects/:id/domains        add domain
POST /v10/projects/:id/promote/:dep   promote
Always: ?teamId=team_xxx   Spec: https://vercel.com/openapi.json
```
