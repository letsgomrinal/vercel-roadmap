# 02 · First Deploys

**Goal:** get comfortable with every way of deploying, plus the daily operations loop.
**Time:** half a day.

## Lab 2.1: Deploy with the CLI (no Git)

```bash
npm i -g vercel
vercel login
vercel teams switch acme-sandbox          # always know which team you're in

npx create-next-app@latest hello-vercel --ts --app --eslint --use-pnpm
cd hello-vercel

vercel            # first run links the folder to a project and makes a Preview deployment
vercel --prod     # production deployment
```

What happened:
- `vercel` created `.vercel/project.json` (the projectId + orgId link). It's git-ignored by default, and you
  don't need to commit it.
- The CLI uploaded your source. The build ran on Vercel, not on your laptop.

Other useful commands:

```bash
vercel ls                                 # list deployments
vercel inspect <url>                      # build info, functions, regions
vercel logs <url>                         # runtime logs
vercel logs --deployment <id> --query 'level:error'
vercel curl /api/health --deployment <preview-url>   # hits a protected preview with your auth
vercel deploy --prebuilt                  # deploy output you built locally / in CI (vercel build)
```

## Lab 2.2: Deploy with Git (the standard engineer flow)

1. Push the repo to GitHub (GitLab, Bitbucket and Azure DevOps also work).
2. Vercel dashboard → **Add New → Project → Import**, or run `vercel git connect`.
3. Open a PR. You get a Preview URL as a PR comment and a Check on the commit.
4. Merge to `main`. That's a Production deployment.

Settings to know (Project → Settings → Git):
- **Production branch** (default `main`).
- **Ignored Build Step**: skip builds when a monorepo path didn't change (`git diff --quiet HEAD^ HEAD ./apps/web`).
- **Deploy Hooks**: a URL that triggers a deploy of a branch. Handy for CMS-driven rebuilds. Requires a connected repo.

## Lab 2.3: Environment variables

```bash
vercel env add DATABASE_URL production        # prompts for value
vercel env add DATABASE_URL preview
vercel env add OPENAI_KEY production --type secret   # write-only after save (a.k.a. --sensitive)
vercel env ls
vercel env pull                                # writes Development vars to .env.local
vercel dev                                     # local dev server with Development vars loaded
```

Rules that bite people:
- **Changes apply only to new deployments.** Redeploy after changing a var.
- Total limit is **64 KB per deployment** across all variables.
- **Secret** type is write-only after saving, so nobody can read it back in the dashboard. Use it for everything sensitive.
- Preview vars can be **branch-scoped** (e.g. `staging` branch gets its own `DATABASE_URL`).
- **Team-level shared env vars** let you define something once (e.g. `SENTRY_DSN`) and link it to many projects.
  This is one of your main platform-engineering levers.

## Lab 2.4: Domains

```bash
vercel domains add app.acme.com          # on the project
# then add the DNS record Vercel shows you (CNAME to cname.vercel-dns.com or A record)
vercel alias set <deployment-url> app.acme.com   # manual alias (rarely needed)
```

- Every project gets `<project>.vercel.app` for free.
- Preview deployments can get a stable branch domain (e.g. `staging.acme.com` → branch `staging`).
- For orgs, consider a **wildcard domain** like `*.apps.acme.com` on the team. Then every new project
  your paved road creates gets `<name>.apps.acme.com` without a DNS ticket. This matters a lot in Module 10.

## Lab 2.5: Promote and roll back

```bash
vercel promote <deployment-url>      # point production at this deployment
vercel rollback                      # instant rollback to the previous production deployment
vercel rollback <deployment-url>
```

Both are instant because nothing is rebuilt (Module 01).
Note: after a rollback, auto-assignment of new production deploys is paused until you promote again.

## Lab 2.6: Zero-account deploy (good to know for business users)

- **Vercel Drop:** drag a folder onto https://vercel.com/drop.
- `vercel deploy --temporary` deploys without an account and gives a claimable link.

These are fine for demos. They are **not** a governed path for your org. You'll build that in Module 10.

## Checkpoint

1. You changed `API_KEY` in the dashboard but production still uses the old value. Why?
2. What's the difference between `vercel` and `vercel --prod`?
3. Where do Development env vars come from when you run `vercel dev`?
4. How would you give every new app a hostname under your company domain without touching DNS each time?
