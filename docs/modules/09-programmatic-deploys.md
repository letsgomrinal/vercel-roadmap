# 09 · Programmatic Deploys: REST API, SDK, CI

**Goal:** drive Vercel entirely from code. This is the foundation for the paved road in Module 10.
**Time:** 1 day.

## 1. Auth & basics

- Create a **team-scoped access token** with an expiry: Account → Tokens. Scope it to the team.
- Base URL: `https://api.vercel.com`. Header: `Authorization: Bearer $VERCEL_TOKEN`.
- Add `?teamId=team_xxx` to every call, or you'll act on your personal account.
- OpenAPI spec: https://vercel.com/openapi.json. Use it to generate clients or check field names.
- Official TS SDK: `@vercel/sdk` (generated from the same spec).

## 2. Deploying without Git: the flow

```
for each file:  sha1(file) ──► POST /v2/files   (headers: x-vercel-digest: <sha1>, Content-Length)
                                    (already uploaded? fine. Content-addressed, so it's skipped)
then:           POST /v13/deployments  { name, project, target?, files: [{file, sha, size}], projectSettings }
then:           GET  /v13/deployments/:id  until readyState ∈ { READY, ERROR, CANCELED }
```

- `files` is required for non-Git deploys and can't be combined with `gitSource`.
- Small files can be **inlined** instead of uploaded: `{ file: 'index.html', data: '<h1>hi</h1>' }`
  (optionally `encoding: 'base64'`).
- `target`: omit for **preview**, or `'production'`, or a custom environment ID.
- `projectSettings` (e.g. `framework: 'nextjs' | 'vite' | 'fastapi' | 'services' | null`) is required on the
  **first** deployment of a project and is remembered afterwards.
- The build still runs on Vercel. You send source, not build output (unless you use `vercel deploy --prebuilt`).

### Lab 9.1: `deploy-folder.ts`, a complete script

```ts
// deploy-folder.ts — usage: VERCEL_TOKEN=... VERCEL_TEAM_ID=... npx tsx deploy-folder.ts ./my-app my-app [--prod]
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.vercel.com';
const TOKEN = process.env.VERCEL_TOKEN!;
const TEAM = process.env.VERCEL_TEAM_ID!;
const auth = { Authorization: `Bearer ${TOKEN}` };
const IGNORE = new Set(['node_modules', '.git', '.vercel', '.next', '.env', '.env.local']);

async function walk(dir: string, root = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, root)));
    else out.push(path.relative(root, full));
  }
  return out;
}

async function upload(buf: Buffer): Promise<string> {
  const sha = createHash('sha1').update(buf).digest('hex');
  const res = await fetch(`${API}/v2/files?teamId=${TEAM}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/octet-stream', 'x-vercel-digest': sha },
    body: buf, // fetch sets Content-Length for Buffer bodies
  });
  if (!res.ok) throw new Error(`upload failed ${res.status}: ${await res.text()}`);
  return sha;
}

async function main() {
  const [dir, name, flag] = process.argv.slice(2);
  const paths = await walk(dir);

  const files = await Promise.all(
    paths.map(async (p) => {
      const buf = await readFile(path.join(dir, p));
      return { file: p.split(path.sep).join('/'), sha: await upload(buf), size: buf.length };
    }),
  );

  const res = await fetch(`${API}/v13/deployments?teamId=${TEAM}&skipAutoDetectionConfirmation=1`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      project: name,
      target: flag === '--prod' ? 'production' : undefined,
      files,
      projectSettings: { framework: null }, // let Vercel detect, or set 'nextjs', 'vite', ...
    }),
  });
  const dep = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(dep));
  console.log('Building', `https://${dep.url}`);

  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await (await fetch(`${API}/v13/deployments/${dep.id}?teamId=${TEAM}`, { headers: auth })).json();
    process.stdout.write(`\r${s.readyState}      `);
    if (['READY', 'ERROR', 'CANCELED'].includes(s.readyState)) {
      console.log(`\n${s.readyState}: https://${s.url}`);
      process.exit(s.readyState === 'READY' ? 0 : 1);
    }
  }
}
main();
```

Try it on a static folder, then on a Next.js app folder (it builds remotely).

### Same thing with `@vercel/sdk` (inline files)

```ts
import { Vercel } from '@vercel/sdk';
const vercel = new Vercel({ bearerToken: process.env.VERCEL_TOKEN });

const dep = await vercel.deployments.createDeployment({
  teamId: process.env.VERCEL_TEAM_ID,
  requestBody: {
    name: 'hello-sdk',
    files: [{ file: 'index.html', data: '<h1>Hello from the SDK</h1>' }],
    projectSettings: { framework: null },
  },
});
console.log(dep.url, dep.readyState);
```

> Check exact SDK method and field names against the current `@vercel/sdk` types. They're generated from
> the OpenAPI spec and occasionally change between majors.

## 3. Provisioning around deployments

The REST endpoints a platform needs. Version numbers drift, so always confirm in the API reference.

| Task | Endpoint (verify version) |
|---|---|
| Create project (optionally linked to a Git repo) | `POST /v11/projects` `{ name, framework, gitRepository? }` |
| Set env var | `POST /v10/projects/{idOrName}/env` `{ key, value, type: 'encrypted' \| 'sensitive', target: ['production','preview'] }` |
| Add domain | `POST /v10/projects/{idOrName}/domains` `{ name: 'vacation.apps.acme.com' }` |
| List deployments | `GET /v6/deployments?projectId=...` |
| Promote / rollback | `POST /v10/projects/{id}/promote/{deploymentId}`, `POST /v9/projects/{id}/rollback/{deploymentId}` |
| Runtime logs | via API / `vercel logs`; or drains |
| Deployment protection, Passport | project settings endpoints (`PATCH /v9/projects/{idOrName}`) |
| Delete project | `DELETE /v9/projects/{idOrName}` |
| Storage (Blob store, Marketplace resources) | storage / integrations endpoints; or `vercel blob create-store`, `vercel install` |

## 4. Git-backed vs files-only: decide for your paved road

| | Files-only (REST upload) | Git-backed (platform-owned GitHub org) |
|---|---|---|
| User needs GitHub | No | **No.** Your platform commits on their behalf via a GitHub App. |
| History / diff / review | Only deployments | Full git history, PR reviews, CODEOWNERS |
| Engineer can take over later | Hard | Easy: they just clone the repo |
| Complexity | Low | Medium (GitHub App + commit API) |

**Recommendation:** use **Git-backed with a platform-owned org** (e.g. `github.com/acme-apps`) for anything that
might live longer than a demo. Business users never see GitHub, but you keep history and an easy handoff to engineering.
Use files-only for throwaway prototypes.

Git-backed flow: create repo from template → commit files via GitHub API → `POST /v11/projects` with
`gitRepository: { type: 'github', repo: 'acme-apps/vacation-tracker' }` → every commit auto-deploys.

## 5. CI/CD with the CLI (for engineers who want CI to own builds)

```yaml
# .github/workflows/deploy.yml
name: deploy
on: { push: { branches: [main] } }
env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm i -g vercel
      - run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      - run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      - run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

Disable Vercel's own Git deployments for that project (`"git": { "deploymentEnabled": false }`) to avoid double builds.

## Checkpoint

1. Why does the files API use SHA-1 digests?
2. What happens if you omit `target`?
3. When is `projectSettings` required?
4. Give two reasons to back business-user apps with a platform-owned Git repo.
