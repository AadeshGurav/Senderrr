# Render.com Platform Knowledge Base

[cmd]: https://commandcode.ai/

This taste file captures Render.com deployment patterns, conventions, common issues, and platform-specific best practices.

---

## Deployment Conventions

### Port & Binding

- **Always bind to `0.0.0.0`** and use `process.env.PORT` (default 10000), never `localhost` or hardcoded ports
- For Docker: use `EXPOSE 10000` and `CMD ["node", "server.js"]` (process.env.PORT set automatically)
- Port 10000 is the standard; `PORT` env var must be referenced, not hardcoded
- Express/Node: ensure `app.listen(PORT, '0.0.0.0')` — binding to `localhost` fails silently

### Health Checks

- Define `healthCheckPath` in render.yaml or Dashboard for every web service
- Health check must return 2xx after verifying dependencies (DB, cache, etc.) — not just server responding
- Health check failures prevent zero-downtime deploys and traffic routing
- Increase `maxShutdownDelaySeconds` if startup time exceeds default 30s

### Start Commands

- Use `$PORT` env var in start commands: `gunicorn app:app --bind 0.0.0.0:$PORT`
- For Node: increase `server.keepAliveTimeout` and `server.headersTimeout` to prevent early disconnects
- Avoid daemonizing in start command — use background worker service type instead

### Zero-Downtime Deploys

- Zero-downtime deploys are disabled when a persistent disk is attached (by design to prevent data corruption)
- Workaround: deploy a Caddy reverse proxy as a separate web service with `lb_try_duration 60s` to buffer requests during instance swap
- New workspaces (after July 2025) default to "Wait" overlapping deploy policy instead of "Override"

### Blueprints (render.yaml)

- **Blueprints never delete resources** — removing a definition from YAML doesn't delete the Render resource
- Reverse order applies: first remove from YAML, then manually delete in Dashboard
- `sync: false` on environment variables prompts for values only on initial creation, not on subsequent syncs
- Don't specify `branch` in service definitions when using preview environments — Render uses the PR's branch automatically
- Adding a resource to Blueprint that was deleted in Dashboard will recreate it
- Use `previewValue` to override env vars for PR previews

---

## Database & Datastore Conventions

### Postgres Connection

- Use **internal connection URL** (from Connect menu) for services in the same region — never public `.onrender.com` URL
- Internal hostnames are region-specific: `dpg-xxx.internal`, `postgres-xxx`
- Correct port: 5432 for direct connection, **6432 for connection pooling** (after enabling PgBouncer)
- Connection string must include `sslmode=require` for TLS 1.2+ compatibility
- Set `ipAllowList: []` to block all external access and enforce internal-only connections

### Connection Pooling (PgBouncer)

- Enable on database Info page — no additional cost, runs on same host
- Enabling requires a database restart — update all clients to port 6432
- Connection pool URL is in the Connect menu after enabling

### Key Value (Redis/Valkey)

- New instances use **Valkey 8.x** (migrated from Redis, API-compatible)
- Persistence modes for paid instances: Journal+Snapshot (default), Snapshot Only, Off (loss-tolerant caching)
- Changing persistence mode requires restart; switching to/from Off loses all data
- Port 6379 for direct connection; connection pooling not available

### Disk Storage & Persistence

- Free tier: ephemeral filesystem, all files lost on redeploy/restart
- Attach persistent disk for custom databases (MySQL, SQLite), file uploads, or arbitrary file storage
- **Single-instance only** — cannot scale to multiple instances with a disk attached
- Cannot access disk during build command or pre-deploy command (runs on separate compute)
- Use Render Postgres for relational data, Render Key Value for key-value data, S3 for object storage

---

## Free Tier Constraints

- Services spin down after 15 consecutive minutes of inactivity, taking ~1 minute to spin back up
- 750 free instance hours per month shared across all free services
- Spun-down services don't consume instance hours
- Free Postgres expires after 30 days (down from 90)
- No SSH access on free tier
- Outbound SMTP ports blocked on free tier
- No autoscaling on free tier

**Keep-alive solutions**:
- External uptime monitor (Uptime Robot free: 50 monitors, 5-min interval) pointed to `https://app.onrender.com`
- Render's native cron job service type as a lightweight pinger
- Upgrade to paid plan for always-on services

---

## Worker & Background Process Patterns

### Background Worker Services

- Use `type: worker` service type, not a web service running a long-running process
- Start command must **not daemonize** — keep the process in the foreground (e.g., `python worker.py`, not `python worker.py &`)
- Background workers can't receive inbound traffic — use `type: pserv` (private service) for internal HTTP endpoints

### Cron Jobs

- Schedules in **UTC only** — no timezone or DST handling
- Single-run guarantee: next schedule is delayed if previous run is still executing
- Cron jobs run on separate compute — can't access main service's persistent disk
- Use idempotent job logic to handle delayed/overlapping runs
- For sleeping services, use Render's native cron job type instead of in-process node-cron

### Graceful Shutdown

- Handle `SIGTERM` to drain in-flight requests before exiting
- Gunicorn: `--timeout 120` to allow longer processing
- Uvicorn: `--timeout-keep-alive 120`
- Set `maxShutdownDelaySeconds` to up to 300s in render.yaml for slow drains
- Node.js: increase `server.keepAliveTimeout` and `server.headersTimeout` to `120000`

---

## Build Pipeline Conventions

- Starter pipeline: 2 CPU, 8 GB RAM — often insufficient for large Docker multi-stage builds
- Upgrade to Performance pipeline tier (16 CPU, 64 GB RAM) for memory-intensive builds on Pro+ workspaces
- Pipeline minutes have a monthly included amount — exceeded minutes stop builds for remainder of billing period
- Set a **spend limit** for pipeline minutes to control unexpected costs
- Build command and pre-deploy command run on separate compute — no disk access, no environment variables from the service
- Pre-deploy command is for database migrations (run against DB, not disk)
- Use `initialDeployHook` for one-time disk initialization tasks

---

## Networking & Private Services

### Private Services (pserv)

- Use `type: pserv` for services that need to receive internal requests from other Render services
- Private services can't receive public traffic
- Private network is **region-specific** — Oregon can't reach Frankfurt internally
- Use public URLs for cross-region communication (slower, consumes outbound bandwidth)
- Background workers and cron jobs are outbound-only — use `pserv` for internal HTTP receivers

### Custom Domains

- DNS propagation can take up to 1 hour; certificate issuance also takes time
- Remove all `AAAA` records before adding CNAME to `onrender.com`
- Root domain must also point to Render for wildcard certificates to work
- Add `_acme-challenge` TXT record for wildcard domain verification
- Use CNAME to `onrender.com` subdomain, not direct IP

### Outbound IP Addresses

- Render uses shared outbound IP ranges — services share a pool of IPs
- Pro+ workspaces can create **dedicated IP sets** ($100/month per set, 3 IPv4 addresses) for allowlisting
- Dedicated IPs are scoped to workspace or specific environments

---

## Logging & Observability

### Retention Periods

- Hobby: 7 days | Pro: 14 days | Scale/Enterprise: 30 days
- **Retention starts from upgrade** — upgrading doesn't retroactively extend old logs
- Use log streams to external providers for long-term retention

### Log Streaming

- Forward to Datadog, Better Stack, Papertrail, or any syslog-compatible provider
- Datadog has deprecated TCP syslog — use HTTPS endpoint instead
- Log streams emit in RFC5424 syslog format — include correlation IDs in application logs for tracing
- Emit structured JSON logs with stable fields: `level`, `message`, `requestId`, `timestamp`
- The log explorer supports filtering by `level`, `instance`, `method`, `status_code`, `host`, `path`

### Structured Logging

- Use JSON format for parseable, searchable logs: `{"timestamp": "...", "level": "error", "message": "...", "requestId": "..."}`
- Include request/trace IDs for cross-service correlation
- Sanitize PII and authentication tokens — never write secrets to stdout
- Service metrics (CPU, memory, HTTP requests) available in Dashboard — correlate with logs for debugging

---

## Scaling Patterns

### Autoscaling

- Available on **Pro workspaces and higher**
- Triggered by target CPU and/or memory utilization
- AI agents are I/O-bound — CPU-based triggers may not accurately reflect capacity
- Horizontal scaling is effective because LLM providers rate-limit per API key, not per instance
- Scaled services are billed per running instance, prorated by the second

### Disk & Scaling Constraints

- **Persistent disk = single instance only** — autoscaling and multi-instance manual scaling are disabled
- Workaround for zero-downtime deploys with disk: Caddy proxy buffer pattern
- For stateful workloads requiring multiple instances: external state management (Postgres, Redis, S3)

---

## Authentication & Security

### OIDC for AWS (Pro+)

- Render-to-AWS OIDC enables automatic credential rotation without long-lived keys
- Connect Render as identity provider in AWS IAM, create trust relationships, assign IAM role via `AWS_ROLE_ARN` env var
- Generally available as of July 2026

### Webhook Security

- Render sends webhook payloads with signature in headers — validate HMAC-SHA256
- Use timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing attacks
- Store webhook secrets in environment variables, not hardcoded

### Secret Management

- Use `sync: false` in render.yaml for sensitive env vars — prompts for values, not stored in YAML
- Secrets are never exposed in logs or error messages
- Audit logs track secret value viewing for Pro+ workspaces (90-day retention)

---

## Service Previews & Preview Environments

- Detect PR previews via `IS_PULL_REQUEST` environment variable (true/false)
- Preview environments use Blueprint — don't specify `branch` in `render.yaml`
- Services with explicit `branch` in render.yaml use that branch instead of PR branch
- Environment groups can be linked to preview environments via Blueprint
- Service previews: Render auto-deploys on push to the PR branch
- Manual mode: include `[render preview]` in PR title to trigger specific previews

---

## API & CLI

### Render API

- Base URL: `https://api.render.com/v1`
- Authentication via API key (Account Settings → API Keys)
- API keys are broadly scoped — they grant access to all workspaces and services the account can access
- Rate limits apply — monitor `429` responses

### Render CLI

- Install: `curl -fsSL https://raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh`
- Authenticate: `render auth login`
- Commands: `render services list`, `render logs`, `render ssh`, `render pg create`, `render kv create`
- SSH into ephemeral instance: `render ssh <service-id> --ephemeral` (billed per second, uses same build artifact)

### MCP Server

- Hosted at `https://mcp.render.com/mcp` for Cursor, Claude Code, Codex, Jules, Windsurf
- Configure via MCP JSON config file with API key in Authorization header
- Supports: service management, deploy triggering, log querying, database operations, metrics
- Limitations: cannot create image-backed services, cannot set IP allowlists, limited resource modifications

---

## Common Issue Patterns & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| 502 Bad Gateway after deploy | Health check failing or port not bound to 0.0.0.0 | Define `healthCheckPath`, bind to `0.0.0.0:$PORT` |
| ECONNREFUSED to Postgres/Redis | Using public URL instead of internal hostname | Use internal URL from Connect menu, verify same region |
| Worker timeout / SIGKILL | Gunicorn timeout too short, processes not draining | Increase `--timeout`, handle SIGTERM gracefully |
| Build fails module not found | Package-lock.json mismatch, case-sensitive paths | Run install locally, verify exact file paths |
| Service spins down on free tier | No traffic for 15 minutes | External uptime monitor, upgrade to paid |
| Blueprint not syncing env vars | `sync: false` only prompts on initial creation | Add to environment group in Dashboard |
| Zero-downtime deploys disabled | Persistent disk attached | Use Caddy proxy buffer, or migrate to managed datastores |
| Cron jobs not running on time | Single-run guarantee, overlapping executions | Set interval longer than runtime, use idempotent logic |
| Old logs missing | Retention period exceeded | Stream logs to external provider (Datadog, Better Stack) |
| Database suspended | Storage full or SLA breached | Resume, increase storage (up to 16TB), enable autoscaling |

---

## Platform-Specific Gotchas

1. **Port**: Always `0.0.0.0:$PORT` (default 10000), never hardcoded
2. **Disk = single instance**: Can't scale horizontally with persistent disk attached
3. **Blueprints never delete**: Remove from YAML first, then Dashboard
4. **Cron schedules UTC only**: No timezone or DST support
5. **Connection pooling port**: Switch from 5432 to 6432 after enabling PgBouncer
6. **SIGTERM handling**: Handle graceful shutdown in worker processes
7. **Log retention not retroactive**: Upgrade doesn't recover old logs
8. **Private network region-specific**: Cross-region requires public URLs
9. **Pre-deploy can't access disk**: Run disk tasks in initialDeployHook
10. **Free tier not production-ready**: Spin-down, 750hr limit, no SSH, no persistence
11. **Overlapping deploy policy**: New workspaces default to "Wait" (changed July 2025)
12. **Workspace plans changed April 2026**: Legacy plan migration in progress
13. **Key Value uses Valkey**: API-compatible with Redis, but migrated as of 2025

---

## References

- Docs: [render.com/docs](https://render.com/docs)
- API: [api-docs.render.com](https://api-docs.render.com)
- Changelog: [render.com/changelog](https://render.com/changelog)
- Discord: [render.com/discord](https://render.com/discord)
- Community (sunset March 2026): [community.render.com](https://community.render.com)
- Feature requests: [feedback.render.com](https://feedback.render.com)
- GitHub examples: [github.com/render-examples](https://github.com/render-examples)
- MCP server: [mcp.render.com](https://mcp.render.com)