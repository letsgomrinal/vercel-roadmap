# 13 · What's Next: Agents on Vercel (Preview of Phase 2)

Not the goal yet, but everything you've learned carries straight over. Here is the agent stack as of Ship 2026.

| Piece | What it is | Status (Nov 2026) |
|---|---|---|
| **AI SDK 7** (`ai`) | TypeScript toolkit: `generateText`, `streamText`, tools, `ToolLoopAgent`, typed tool context, `toolApproval`, timeouts, OTel (`@ai-sdk/otel`), realtime/video (experimental). A Python AI SDK is in Beta. | Released Jun 2026 |
| **AI Gateway** | One endpoint for hundreds of models: fallbacks, **budgets per key/project/team/person**, ZDR, US-only inference. OIDC auth on Vercel. | GA |
| **Workflow** + `@ai-sdk/workflow` `WorkflowAgent` | Durable agent runs that survive deploys, restarts and days-long approvals | Workflow: check docs. Python Beta. |
| **Vercel Sandbox** (`@vercel/sandbox`) | Isolated Linux microVMs for running AI-generated or untrusted code. Persistent by default (May 2026). **Drives** (persistent mounted storage, forkable) GA Oct 2026. | GA |
| **Vercel Connect** | Gives agents scoped, short-lived credentials to 1,000+ external tools. No long-lived tokens in env. MCP Events and Enterprise-Managed Authorization in Beta. | GA (Oct 2026) |
| **eve** (eve.dev) | Open-source agent framework: each agent is a directory (Markdown instructions + TS tools). Durable execution, approvals, subagents, evals, memory. | Announced Ship 2026 |
| **Queues / Daemons** | Agent background work and long-running workers | Beta |
| **MCP on Vercel** | Host MCP servers with `mcp-handler` (Module 10 already did this) | GA |

Things to try first, once applications are running smoothly:
1. Put AI Gateway in front of every LLM call in the org: one bill, budgets, model switching, ZDR.
2. Add a `chat-agent` template to your paved road (AI SDK + Gateway + Passport).
3. Add Sandbox-backed "run code" tools to the MCP server for analysts.
4. Use Workflow + `WorkflowAgent` for multi-hour agent tasks with approvals.

Sources: https://vercel.com/blog/vercel-ship-2026-recap · https://vercel.com/blog/ai-sdk-7 · https://vercel.com/docs/ai-gateway · https://vercel.com/docs/vercel-sandbox
