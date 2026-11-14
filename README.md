# Vercel: Zero to Hero for AI Platform Engineers

A hands-on roadmap and 13 tutorial modules: from first deploy to running a governed, self-service
Vercel platform (including an MCP server so non-technical users can ship).

**Read it here:** https://letsgomrinal.github.io/vercel-roadmap/

The content lives in [`docs/`](docs/). The roadmap with progress tracking is [`docs/roadmap.md`](docs/roadmap.md),
and the modules are in [`docs/modules/`](docs/modules/).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173/vercel-roadmap/
npm run build      # static output in docs/.vitepress/dist
```

Every push to `main` is deployed to GitHub Pages by `.github/workflows/deploy.yml`.

> Researched against Vercel docs and changelog as of 14 Nov 2026. Features marked Beta may change.
