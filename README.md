# NEXORA

Maintained by [@arpitkjaiswal](https://github.com/arpitkjaiswal).

An engineering intelligence application with a React/TypeScript dashboard and
a Node.js analysis API. It imports GitHub repositories, maps relative imports,
checks code patterns and npm advisories, measures JavaScript/TypeScript source
complexity, and generates prioritized reviews.

## Run locally

Use Node.js 24, npm, and Git:

```sh
npm ci
npm run dev
```

The development command starts the API on port 3001 and Vite on port 5173.
Client and server changes reload automatically. Service shutdown stops both
process groups. Existing servers must be reused or stopped before starting
another copy.

In the managed cloud environment, use the writable npm cache:

```sh
cd /workspace/NEXORA
npm --cache /workspace/.cache/npm ci --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Demo workspace is explicitly sample data. To obtain real results, use **Run
analysis → Analyze this workspace** or enter `owner/repository` / a GitHub HTTPS
URL. Your workspace stores real snapshots and historical scores. You can
inspect graph nodes, filter findings, open file locations, generate a review,
and download JSON reports.

## Deploy to Render

[Deploy NEXORA using your Render account](https://render.com/deploy?repo=https://github.com/arpitkjaiswal/NEXORA)

This opens Render's Blueprint setup for this repository. Sign in to Render,
review the service and disk, and set the workspace password directly there.
You do **not** need to give this agent a Render API key for this route. Keep any
AI or private GitHub credentials in Render's environment settings.

The repository contains a multi-stage Docker image, `render.yaml`, a deployment
script, and GitHub Actions checks. The blueprint uses **Render's paid Starter
plan with a 1 GB persistent disk**, in Singapore. Review current provider pricing
before creating a service; this is not a free-tier configuration.

The public application requires a workspace password. It refuses to start in
production if `NEXORA_AUTH_PASSWORD` is missing or shorter than 12 characters.
Health checks remain public; workspace data, analysis jobs, imports, and reviews
require a session.

Two deployment routes are supported:

1. In Render, create a Blueprint from `arpitkjaiswal/NEXORA`, select `main`, and
   enter `NEXORA_AUTH_PASSWORD` when prompted. Render configures Docker, HTTPS,
   health checks, and persistent storage using `render.yaml`.
2. For deployment from this workspace, set `RENDER_API_KEY` securely in environment
   settings, supply `NEXORA_AUTH_PASSWORD` as a direct runtime variable, and allow
   HTTPS access to `api.render.com`. Then run:

```sh
npm run deploy:render                 # Read-only account/service preflight
npm run deploy:render -- --apply      # Create the paid service or deploy its tested commit
```

The script checks that local HEAD is pushed to `origin/main`, selects the only
accessible Render workspace, and creates a service only when none exists. If
multiple workspaces are available, set `NEXORA_RENDER_OWNER_ID`. It refuses to
overwrite an unrelated service named `nexora`. Existing service environment
values are preserved. It polls the specific deployment and reports its provider
URL only after Render marks it live. Validate sign-in and analysis at that URL
before calling the deployment verified.

`RENDER_API_KEY` is used only by the deployment client; it is never installed in
the hosted application. Missing credentials prevent provisioning. A blueprint,
Docker build, or saved environment draft is not a live deployment.

## Configuration

Set application secrets in Render's environment settings, or in an ignored local
`.env` for development. Never put secret values in Git, logs, `VITE_` variables,
or chat.

| Variable                       | Purpose                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- |
| `NEXORA_AUTH_PASSWORD`         | Required in production; workspace sign-in password, at least 12 characters. |
| `NEXORA_DATA_DIR`              | Persistent snapshots/jobs directory; Docker/Render uses `/var/lib/nexora`.  |
| `NEXORA_AI_API_KEY`            | Optional OpenAI key for provider-backed AI reviews.                         |
| `NEXORA_AI_MODEL`              | Optional model name; defaults to `gpt-4.1-mini`.                            |
| `NEXORA_GITHUB_TOKEN`          | Optional server-side GitHub read token for private repository imports.      |
| `NEXORA_GITHUB_WEBHOOK_SECRET` | Optional shared secret for signed push / pull request events.               |
| `PORT`, `HOST`                 | Listener address; Docker binds `0.0.0.0` and Render sets its service port.  |

The local cloud environment's GitHub proxy authentication is reused for Git
operations. It is not automatically available on Render. Public GitHub imports
need no token; private imports on Render need the explicit read token above or
equivalent configured Git credentials.

AI reviews send only repository names, file paths, findings, and graph metadata
to `api.openai.com` when requested. Source text is not sent. Rules-based
engineering reviews work without an AI key and are explicitly identified as
rules output. Live AI provider behavior requires a valid configured key; mocked
adapter tests do not establish live provider readiness.

For initial API-based provisioning only, `NEXORA_DEPLOY_AI_KEY` can supply a raw
AI key to install in the new Render service. Do not copy a cloud proxy placeholder
into hosted environment values. Otherwise configure the real key directly in
Render after creation. The same distinction applies to private GitHub tokens.

## Automated GitHub reviews

Set `NEXORA_GITHUB_WEBHOOK_SECRET` on the hosted server. Create a GitHub JSON
webhook at `https://<your-service>/api/webhooks/github` using the same secret and
enable push and pull request events. HMAC-SHA256 signatures are required before
any event is queued. Delivery IDs prevent duplicate jobs.

Pushes analyze the event commit. Opened/reopened/updated pull requests analyze
the head commit and get a separate PR snapshot. Results and an automated
engineering review appear in the dashboard. NEXORA never publishes PR comments
or modifies a repository automatically.

## Validation

```sh
npm run build       # TypeScript and production client build
npm run lint
npm test            # Analyzer, API, authentication, persistence, advisories, adapter, deployment tests
npm run test:e2e    # Browser sign-in/out, session restoration, dashboard, reviews, graph, exports, mobile
```

Browser tests use `/usr/bin/chromium`, `CHROMIUM_PATH`, or Playwright's installed
Chromium. If necessary run `npx playwright install chromium`. The runner starts
development services and shuts them down gracefully. GitHub Actions installs
Chromium and runs the same checks before automatic Render deployments.

To build and test the container on a standard Docker host:

```sh
docker build -t nexora:production .
npm run test:container
```

In a managed cloud environment, follow the runtime skill's proxy/CA instructions
and build with its public CA as a BuildKit secret:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t nexora:production .
```

The container smoke test uses a temporary random password and a temporary named
volume, then cleans up both containers and volume. It verifies authentication,
source/advisory analysis, a real GitHub import, rules-based reviews, and snapshot
persistence across restart. The image runs as a non-root user. CA mounts are
session-specific and are not baked into the final image.

## Coverage and boundaries

- Source discovery covers TS/JS, Python, Go, Rust, Java, CSS, HTML, and JSON.
  The interactive graph currently resolves relative JS/TS imports, including
  extensionless and directory-index imports; it is not a deployment topology.
- JavaScript/TypeScript AST metrics cover control-flow branching, nested loops,
  and awaits inside loops. Complexity estimates are not runtime benchmarks.
- Code checks flag patterns such as dynamic evaluation, raw HTML insertion,
  possible SQL/shell interpolation, blocking I/O, debug statements, and `any`.
  Review code signals in context; they can be false positives.
- npm lockfiles v2/v3 are checked against npm's published advisory registry.
  Only package names and locked versions are sent. Version-range matches are
  advisory findings, not proof of exploitability. Unsupported/missing lockfiles
  and registry failures are shown explicitly. Other ecosystem advisories and
  runtime profiling are not implemented.
- Limits: 2,000 eligible files, 256 KB per source file, 500 code findings,
  500 advisory findings, 24 displayed modules, 20 repository snapshots, and
  five queued analyses. Limits can produce partial snapshots, labeled in the UI.
- Imported code is never executed, built, or installed. Temporary checkouts are
  removed after scans. Symlinks, dependencies, tests, and generated output are
  excluded. Legacy caches created by earlier versions are not silently removed.
- Authentication protects a single shared workspace. It is not a multi-tenant
  SaaS permission system. Password sessions expire after 24 hours and reset on
  server restart; sign-out revokes the current session.

Snapshots and recent jobs are saved atomically in `workspace.json` under the
data directory. Jobs interrupted by restart become failed records and can be
rerun. Back up the persistent disk for recovery. Processes restart on each
deployment; storage must not be replaced with an ephemeral filesystem.
