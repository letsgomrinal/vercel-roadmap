# 10 · The Paved Road: Letting Non-Technical Users Ship Safely

**Goal:** design and build the system that lets business users (no GitHub) deploy apps through an AI
assistant, with your guardrails.
**Time:** 2–3 days.

## 1. Your options

| Option | Who | Pros | Cons |
|---|---|---|---|
| **v0** (v0.app) | Business users | Prompt → working app → deploy to Vercel. No local tooling. Team/Enterprise plans can connect to your Vercel team. | Less control over what gets built and where it lands. Check v0's enterprise controls against your policies. |
| **Official Vercel MCP** (`https://mcp.vercel.com`) | **Engineers** in Claude Code / Cursor / Codex | Zero build. OAuth. ~28 tool categories (projects, deployments, logs, env vars, domains, firewall, rolling releases, sandboxes, ...). | Acts with the user's **full** Vercel permissions. `deploy_to_vercel` deploys a *local* project, so it isn't a fit for people without a dev environment. Too much power for business users. |
| **Your own MCP server** ("Acme Deploy") | **Business users** in Claude / ChatGPT / Copilot | You choose the tools, templates, naming, protection and limits. One place for policy and audit. | You build and run it. |
| **Templates + Deploy Button / internal portal** | Both | Simple, predictable | Not conversational; users still need to edit code somehow |

**Recommendation:**
- Engineers: Git flow + the **official Vercel MCP** for ops (logs, deployments, env).
  `claude mcp add --transport http vercel https://mcp.vercel.com`
- Business users: **your own MCP server** that wraps the Vercel REST API, deploys from **approved templates**,
  lands apps in a dedicated team gated by **Vercel Passport**, and backs each app with a repo in a
  platform-owned GitHub org.

## 2. Target architecture

```
 Business user in Claude / ChatGPT
   "Build me a vacation tracker for my team"
          │  (assistant writes code into a template's allowed folders)
          ▼
 ┌──────────────────────────── Acme Deploy MCP (a Next.js app on Vercel) ───────────────────────────┐
 │ OAuth (your IdP: Okta/Entra) → who is this user? which groups?                                     │
 │ Policy layer: name rules, template allowlist, file/size/type checks, secret scanning, quotas,       │
 │               preview-first, production needs approval, storage allowlist                         │
 │ Registry DB (Neon): app ↔ owner ↔ project ↔ repo, audit log of every tool call                     │
 │ Vercel REST (team-scoped token, Secret env var) · GitHub App (commits to acme-apps org)            │
 └───────────────────────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
 Vercel team "acme-apps":  Passport default (employees only) · wildcard *.apps.acme.com ·
                           team log drains · spend alerts · Firewall baseline
```

### Tool design (keep it small and intention-revealing)

| Tool | Who can call | What it does |
|---|---|---|
| `list_templates` | everyone | Approved starters: "internal dashboard", "form + table", "file intake", "API only" |
| `create_app` | everyone (quota) | Repo from template + Vercel project + domain + Passport + optional storage |
| `deploy_changes` | app owner | Commit/upload changed files → **Preview** deployment → returns URL |
| `get_status` | app owner | Build state; on failure, **trimmed** build log so the assistant can fix code |
| `get_logs` | app owner | Recent runtime errors (redact secrets/PII) |
| `promote_to_production` | app owner + **approval** | Promote a READY preview. Requires reviewer approval for some templates/data classes. |
| `rollback` | app owner | Instant rollback |
| `add_storage` | app owner | From an allowlist only: Postgres (Neon), private Blob, Redis |
| `set_config` | app owner | Non-secret env vars only. For secrets, return a link to the dashboard or your secret UI. |
| `delete_app` | platform admins | — |

**Design principles:**
1. **Templates over free-form.** The assistant edits only allowed paths (e.g. `app/**`, `components/**`).
   Templates come pre-wired with Passport claims, logging, DB client, security headers (`vercel.ts` presets).
2. **Preview first, always.** Production is a separate, auditable step.
3. **The server owns the Vercel token.** Users never get Vercel credentials.
4. **Return actionable errors.** Build logs go back to the assistant so it can self-correct.
5. **Treat tool input as untrusted.** It came from an LLM. Validate everything.

## 3. Build it

Stack: Next.js on Vercel + `mcp-handler` (Vercel's MCP adapter) + `zod` + Neon for the registry.

```bash
npx create-next-app@latest acme-deploy-mcp --ts --app
cd acme-deploy-mcp
pnpm add mcp-handler @modelcontextprotocol/sdk zod @neondatabase/serverless jose
```

### 3.1 The MCP route

```ts
// app/mcp/route.ts
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { verifyIdpToken } from '@/lib/auth';
import { policy } from '@/lib/policy';
import { vercel } from '@/lib/vercel';
import { registry } from '@/lib/registry';

const FileSchema = z.object({
  path: z.string().max(200),
  content: z.string().max(500_000),
});

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_templates',
      { title: 'List app templates', description: 'Approved starter templates for new apps.', inputSchema: {} },
      async () => ({ content: [{ type: 'text', text: JSON.stringify(policy.templates, null, 2) }] }),
    );

    server.registerTool(
      'create_app',
      {
        title: 'Create a new app',
        description: 'Creates an app from an approved template. Returns its preview URL.',
        inputSchema: {
          name: z.string().regex(/^[a-z][a-z0-9-]{2,30}$/).describe('lowercase, dashes, 3-31 chars'),
          template: z.enum(['internal-dashboard', 'form-table', 'file-intake', 'api-only']),
          description: z.string().max(300),
        },
      },
      async ({ name, template, description }, extra) => {
        const user = extra.authInfo!.extra as { email: string; groups: string[] };
        await policy.assertCanCreate(user);                        // quotas, group membership
        const app = await registry.createApp({ name, template, owner: user.email, description });
        const project = await vercel.createProjectFromTemplate(app);  // repo + project + domain + Passport
        await registry.audit(user.email, 'create_app', { name, template });
        return { content: [{ type: 'text', text: `Created ${name}. Preview: ${project.previewUrl}` }] };
      },
    );

    server.registerTool(
      'deploy_changes',
      {
        title: 'Deploy changes to preview',
        description: 'Uploads changed files for an app you own and creates a PREVIEW deployment.',
        inputSchema: { app: z.string(), files: z.array(FileSchema).max(100), message: z.string().max(200) },
      },
      async ({ app, files, message }, extra) => {
        const user = extra.authInfo!.extra as { email: string };
        const record = await registry.requireOwner(app, user.email);
        const problems = policy.validateFiles(record.template, files);  // paths, types, size, secrets
        if (problems.length) return { isError: true, content: [{ type: 'text', text: problems.join('\n') }] };

        const dep = await vercel.deployPreview(record, files, message);   // Module 09 flow, or git commit
        await registry.audit(user.email, 'deploy_changes', { app, deploymentId: dep.id });
        return { content: [{ type: 'text', text: `Building preview ${dep.id}. Call get_status to follow.` }] };
      },
    );

    server.registerTool(
      'get_status',
      {
        title: 'Deployment status',
        description: 'Build status for a deployment. On failure includes the last build log lines.',
        inputSchema: { app: z.string(), deploymentId: z.string() },
      },
      async ({ app, deploymentId }, extra) => {
        const user = extra.authInfo!.extra as { email: string };
        await registry.requireOwner(app, user.email);
        const s = await vercel.getDeployment(deploymentId);
        const tail = s.readyState === 'ERROR' ? await vercel.buildLogTail(deploymentId, 60) : '';
        return { content: [{ type: 'text', text: `${s.readyState} https://${s.url}\n${policy.redact(tail)}` }] };
      },
    );

    server.registerTool(
      'promote_to_production',
      {
        title: 'Promote to production',
        description: 'Requests promotion of a READY preview to production. May require approval.',
        inputSchema: { app: z.string(), deploymentId: z.string() },
      },
      async ({ app, deploymentId }, extra) => {
        const user = extra.authInfo!.extra as { email: string };
        const record = await registry.requireOwner(app, user.email);
        if (policy.needsApproval(record)) {
          const req = await registry.requestApproval(record, deploymentId, user.email);  // Slack/Teams message
          return { content: [{ type: 'text', text: `Approval requested (${req.id}). You'll be notified.` }] };
        }
        await vercel.promote(record.projectId, deploymentId);
        await registry.audit(user.email, 'promote', { app, deploymentId });
        return { content: [{ type: 'text', text: `Live at https://${record.domain}` }] };
      },
    );
  },
  { serverInfo: { name: 'acme-deploy', version: '1.0.0' } },
  { basePath: '', maxDuration: 300 },
);

// Every request must carry a valid token from your IdP.
const authed = withMcpAuth(handler, verifyIdpToken, { required: true });
export { authed as GET, authed as POST, authed as DELETE };
```

```ts
// lib/auth.ts — verify the bearer token issued by your IdP for this MCP resource
import { createRemoteJWKSet, jwtVerify } from 'jose';
const JWKS = createRemoteJWKSet(new URL(process.env.IDP_JWKS_URL!));

export async function verifyIdpToken(_req: Request, bearer?: string) {
  if (!bearer) return undefined;
  const { payload } = await jwtVerify(bearer, JWKS, {
    issuer: process.env.IDP_ISSUER,
    audience: process.env.MCP_RESOURCE_URL,          // e.g. https://deploy.apps.acme.com/mcp
  });
  return {
    token: bearer,
    clientId: String(payload.azp ?? payload.client_id ?? 'unknown'),
    scopes: String(payload.scope ?? '').split(' '),
    extra: { email: payload.email as string, groups: (payload.groups as string[]) ?? [] },
  };
}
```

MCP clients discover your IdP through **OAuth Protected Resource Metadata**:

```ts
// app/.well-known/oauth-protected-resource/route.ts
import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';
const handler = protectedResourceHandler({ authServerUrls: [process.env.IDP_ISSUER!] });
export { handler as GET, metadataCorsOptionsRequestHandler as OPTIONS };
```

> `mcp-handler` APIs evolve with the MCP spec. Check its README (github.com/vercel/mcp-handler) for current
> names (`registerTool` vs `tool`, auth helpers) before you copy this.

### 3.2 The policy layer (the part that actually matters)

```ts
// lib/policy.ts (excerpt)
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,                    // AWS access key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /sk-[A-Za-z0-9]{20,}/,                 // common API key shape
  /xox[baprs]-[A-Za-z0-9-]+/,            // Slack
];

const ALLOWED_PATHS: Record<string, RegExp[]> = {
  'internal-dashboard': [/^app\//, /^components\//, /^lib\/queries\//, /^public\//],
  'form-table':         [/^app\//, /^components\//, /^db\/schema\.ts$/],
};

export const policy = {
  templates: [
    { id: 'internal-dashboard', desc: 'Read-only dashboard over Postgres, employee-only' },
    { id: 'form-table', desc: 'Form that writes to a table + admin list view' },
    { id: 'file-intake', desc: 'Upload files to private storage + processing queue' },
    { id: 'api-only', desc: 'Small JSON API (Python or Node)' },
  ],
  validateFiles(template: string, files: { path: string; content: string }[]) {
    const problems: string[] = [];
    const total = files.reduce((n, f) => n + f.content.length, 0);
    if (total > 5_000_000) problems.push('Total change is over 5 MB.');
    for (const f of files) {
      if (f.path.includes('..') || f.path.startsWith('/')) problems.push(`Illegal path ${f.path}`);
      if (!ALLOWED_PATHS[template]?.some((re) => re.test(f.path)))
        problems.push(`${f.path} is outside the editable area for template ${template}.`);
      if (/(^|\/)\.env/.test(f.path) || f.path === 'vercel.json' || f.path === 'vercel.ts')
        problems.push(`${f.path} is managed by the platform.`);
      if (SECRET_PATTERNS.some((re) => re.test(f.content)))
        problems.push(`${f.path} appears to contain a secret. Use set_config / the secrets UI instead.`);
    }
    return problems;
  },
  // assertCanCreate, needsApproval, redact ...
};
```

### 3.3 Provisioning an app (what `createProjectFromTemplate` does)

1. Create repo `acme-apps/<name>` from the template repo (GitHub App, "generate from template").
2. `POST /v11/projects` in team `acme-apps` with `gitRepository` → linked.
3. Add domain `<name>.apps.acme.com` (the wildcard cert already exists on the team).
4. Make sure Passport is applied (team default) and Deployment Protection is on for previews.
5. Optionally provision storage (Neon DB / private Blob store) and connect it to Production + Preview.
6. Set baseline env vars (`APP_OWNER`, `DATA_CLASS`), plus team shared vars (drains, Sentry).
7. Write the registry row and audit entry.

### 3.4 Deploying the MCP server itself

- Deploy `acme-deploy-mcp` to the `acme-platform` team.
- Env vars (Secret): `VERCEL_TOKEN` (team-scoped to `acme-apps`, expiring, rotated), `GITHUB_APP_PRIVATE_KEY`,
  `DATABASE_URL`, `IDP_ISSUER`, `IDP_JWKS_URL`, `MCP_RESOURCE_URL`.
- Firewall rate limit on `/mcp`. Log drains on. Rolling releases on.
- Register it as a **custom connector** in Claude (Team/Enterprise admin settings) and in other assistants
  your org uses. Users sign in with SSO the first time.

## 4. Security notes for MCP + LLM-driven deploys

- **Prompt injection:** a user's assistant may read hostile content and try to call your tools. Mitigations:
  owner checks on every call, preview-first, human approval for production, no tool that reveals secrets.
- **Least privilege:** the server's Vercel token is scoped to `acme-apps` only, never your prod team.
- **Code review at the boundary:** for higher data classes, `promote_to_production` opens a PR in the
  `acme-apps` repo that requires an engineer's approval (CODEOWNERS).
- **Cost:** per-user app quotas, spend alerts on the team, AI Gateway budgets per project.
- **Lifecycle:** a cron that flags apps with no deploys or traffic for 90 days, notifies the owner, then archives them.

## Lab 10.1

1. Build the server with `list_templates`, `create_app`, `deploy_changes`, `get_status`.
2. For a first cut, skip GitHub. Use the files-only flow from Module 09 and a static token check instead of OAuth.
3. Connect it locally: `claude mcp add --transport http acme-deploy http://localhost:3000/mcp`.
4. Ask Claude: *"Create an internal dashboard called team-okrs that shows a table of objectives, then deploy it."*
   Watch the tool calls, introduce a build error, and confirm the assistant fixes it from `get_status`.
5. Add OAuth with your IdP, then Passport on the target team. Repeat as a non-admin test user.

## Checkpoint

1. Why shouldn't business users use the official Vercel MCP directly?
2. Name three checks `deploy_changes` must perform before calling Vercel.
3. Where does the Vercel token live, and what is it scoped to?
4. How does a business-user app become an engineering-owned app later?
