# 07 · Security, Access & Governance

**Goal:** make Vercel safe to hand to a whole organization.
**Time:** 1 day.

## 1. Team structure & RBAC

**Team roles** (team-wide): Owner, Member, Developer, Billing, Viewer, plus **Contributor** on Enterprise,
which gets access only to the projects you assign. **Project-level roles** and **Access Groups** let you map
"Finance team → these projects" in one place.

Suggested org layout:

| Team | Who | Notes |
|---|---|---|
| `acme-platform` | Platform engineers | Shared tooling, the MCP server, presets |
| `acme-apps` | All builders | Business-user apps land here via the paved road. Contributor role + Access Groups. |
| `acme-prod-critical` | Product engineering | Stricter protection, rolling releases mandatory |

Identity:
- **SAML SSO** (Okta, Entra ID, Google...) and **Directory Sync / SCIM**: Enterprise (SSO also as a Pro add-on).
  Map IdP groups to Access Groups so joiners/leavers are automatic.
- **Access tokens:** create **team-scoped** tokens with expiry for automation. Never use a personal token in a service.

## 2. Deployment Protection (who can view a deployment)

| Method | What | Plan |
|---|---|---|
| **Vercel Authentication** | Only logged-in team members (or people granted access) can view | All. On by default for previews. |
| **Password Protection** | Shared password | Enterprise / Pro add-on |
| **Trusted IPs** | Only from your VPN/office ranges | Enterprise |
| **Vercel Passport** | Your own OIDC IdP (Okta, Auth0, Entra...) in front of the app | GA since Jul 2026 |

Scope can be *Preview only*, *All except custom domains*, or *All deployments*.

**Protection Bypass for Automation:** a secret your E2E tests/CI send (`x-vercel-protection-bypass` header)
to reach protected previews.

### Vercel Passport: internal apps with your IdP and zero auth code

This is the feature that makes "business user builds an internal tool" safe:

- Gate deployments behind your **OIDC provider**. Reuse one OIDC app across projects, set it as the **team
  default for new projects**, and bulk-assign it to existing ones.
- After login, Vercel injects a signed JWT in the **`x-vercel-oidc-passport-token`** header. Read the
  `external_sub` claim for a stable user ID, and email/groups for authorization.

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
// Verify the token per the Passport docs (issuer/JWKS URL from https://vercel.com/docs) before trusting claims.
const token = req.headers.get('x-vercel-oidc-passport-token');
```

**Platform recommendation:** set Passport as the team default on `acme-apps`. Every app a business user
ships is then employee-only from the first deploy, with no auth code in the app.

## 3. Firewall & bot protection

- **Vercel Firewall** (all plans): DDoS mitigation is automatic.
- **Custom rules / WAF**: block or challenge by path, IP, country, header or JA4. Changes go live in seconds, with no redeploy.
- **Managed rulesets** (OWASP etc.): Enterprise.
- **Rate limiting:** a firewall rule, or in code:

```ts
import { checkRateLimit } from '@vercel/firewall';
const { rateLimited } = await checkRateLimit('api-login', { request });
if (rateLimited) return new Response('Too many', { status: 429 });
```

- **BotID** (`botid` package): invisible bot detection for sensitive endpoints (signup, checkout, AI endpoints that cost money).
- **Attack Challenge Mode**: one switch when under attack.

## 4. Secrets & credentials: prefer OIDC over static keys

Vercel issues **short-lived OIDC tokens** for each project/environment:
- Builds: `VERCEL_OIDC_TOKEN` env var.
- Functions: `x-vercel-oidc-token` request header (TTL 2h). `@vercel/oidc` handles this for you.
- Local: `vercel env pull` writes one into `.env.local`.

Vercel-native services (Blob, Queues, AI Gateway) already use it. **Use it to reach your own cloud too.**

### Lab 7.1: Access AWS S3 from Vercel with no AWS keys

1. AWS IAM → Identity providers → add OIDC provider:
   - URL: `https://oidc.vercel.com/<TEAM_SLUG>`
   - Audience: `https://vercel.com/<TEAM_SLUG>`
2. Create a role with a trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT>:oidc-provider/oidc.vercel.com/<TEAM_SLUG>" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "oidc.vercel.com/<TEAM_SLUG>:aud": "https://vercel.com/<TEAM_SLUG>",
        "oidc.vercel.com/<TEAM_SLUG>:sub": "owner:<TEAM_SLUG>:project:<PROJECT>:environment:production"
      }
    }
  }]
}
```

3. Set `AWS_ROLE_ARN` and `AWS_REGION` on the project. Set the region explicitly, because the default isn't stable.
4. Code:

```ts
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: awsCredentialsProvider({ roleArn: process.env.AWS_ROLE_ARN! }),
});
```

The `sub` claim lets you grant **production of project X only**. Previews can't touch prod data.
GCP works the same way via Workload Identity Federation (`@vercel/oidc` → `getVercelOidcToken()`).

## 5. Enterprise network & compliance options

- **Secure Compute:** dedicated private network with static egress IPs, and VPC peering to your cloud. Enterprise.
- **Bring Your Own Cloud (AWS):** functions run in *your* AWS account. GA at Ship SF (Oct 2026), Enterprise.
- **Static IPs** for allowlisting by third parties (Pro add-on).
- SOC 2 Type 2, ISO 27001, HIPAA BAA (Enterprise), GDPR DPA. **Audit logs** on Enterprise. Stream them to your SIEM.
- AI Gateway: **Zero Data Retention** and US-only inference options.

## 6. Governance checklist for your org

- [ ] SSO + SCIM on; IdP groups mapped to Access Groups
- [ ] Separate teams by sensitivity
- [ ] Vercel Authentication on all previews; **Passport default** for internal-app team
- [ ] Production env vars marked **Secret**; no prod creds in Preview
- [ ] OIDC federation for AWS/GCP; ban static cloud keys
- [ ] Firewall baseline rules; BotID on costly endpoints
- [ ] Team-scoped, expiring automation tokens stored in a secret manager
- [ ] Spend management / budgets on (team usage alerts, AI Gateway budgets per key/project)
- [ ] Audit log streaming to SIEM
- [ ] Log drains to your observability stack (Module 08)

## Checkpoint

1. A business user ships an internal dashboard. How do you make sure only employees see it, without them writing auth?
2. Why is OIDC federation better than storing `AWS_SECRET_ACCESS_KEY`?
3. How do your Playwright tests hit a protected preview?
