# Senderrr → Render Free Tier Deployment: Task Breakdown

**Goal:** Deploy Senderrr (WhatsApp gateway) on Render's free web service tier so that:
- The service survives Render's free-tier spin-down/restart cycle without losing WhatsApp session auth
- No paid persistent disk is required
- All app data (Postgres) and WhatsApp session data (also Postgres) survive restarts

**Why this is needed:** Free Render web services have an ephemeral filesystem — nothing written to local disk survives a restart, redeploy, or 15-minute-inactivity spin-down. Senderrr currently stores both its SQLite DB and WhatsApp session files on local disk (`LocalAuth` from whatsapp-web.js), which breaks on every restart. The existing `render.yaml` in the repo also attaches a persistent disk — **that only works on paid plans and will fail/be ignored on the free tier**, so it needs to be removed as part of this work.

---

## Task 0 — Stand up Senderrr as a Render Web Service

**Owner file(s):** `render.yaml`, `Dockerfile`, `.render/env.yaml` (if present)

1. **Provision a free Render Postgres database first** (needed before deploy so the connection string exists):
   - Render Dashboard → New → PostgreSQL → free plan.
   - Copy the **Internal Connection String** (not the external one — internal is required for same-region service-to-database traffic and doesn't count against bandwidth).
   - Note: free Render Postgres **expires 30 days after creation** — plan for a reminder to upgrade or recreate before then; this is a real operational constraint, flag it to Aadesh.

2. **Edit `render.yaml`:**
   - Remove the entire `disk:` block (`name: senderrr-data`, `mountPath: /var/data`, `sizeGB: 1`) — persistent disks are not available on the free plan and this will either be rejected by Render or silently break the Blueprint.
   - Change `DATABASE_TYPE` from `"sqlite"` to `"postgres"` and remove `DATABASE_NAME` (SQLite path) — replace with a `DATABASE_URL` env var set to `sync: false` (value entered manually in the dashboard from the internal connection string).
   - Change `STORAGE_LOCAL_PATH` and `SESSION_DATA_PATH` — these paths pointed at `/var/data/...` which no longer exists once the disk is removed. Session storage moves to Postgres in Task 2; for media storage, either keep it local (accepting it's wiped on restart, acceptable if media isn't business-critical) or note as a follow-up to add S3-compatible storage (the app already has an S3 SDK wired in per the codebase — out of scope for this task list, flag separately).
   - Keep `PORT: 10000` and `HOST: 0.0.0.0` as-is — these are already correct for Render's requirements.
   - Keep `healthCheckPath: /api/health/live` as-is — confirm this route returns a real 2xx only when the app (including DB connection) is actually ready, not just "server process is up."

3. **Confirm `Dockerfile` binds correctly:**
   - Already exposes `10000` and reads `PORT` at runtime via the health check — no changes needed here, just verify during first deploy.

4. **Deploy via Blueprint:**
   - Push the edited `render.yaml` to the repo.
   - Render Dashboard → Blueprints → connect the GitHub repo → Render auto-detects `render.yaml`.
   - Set the secrets Render prompts for (`WA_JWT_SECRET`, `API_KEY`, `DATABASE_URL`) in the dashboard — never commit these.

**Acceptance criteria:** Service deploys successfully, `/api/health/live` returns 200, and the app boots without errors referencing `/var/data` (confirms the disk removal didn't break a path reference somewhere else in the codebase — grep for `/var/data` and `RENDER_DISK_PATH` to be sure nothing else depends on it).

---

## Task 1 — External Keep-Alive Ping

**Owner file(s):** none in-repo; this is external config. (Note: `render.yaml` already sets `KEEP_ALIVE_ENABLED=true` / `KEEP_ALIVE_INTERVAL_MS=420000` — check what this actually does in the codebase; if it's an **internal** timer/scraper, it will NOT prevent spin-down, since Render's spin-down is based on external inbound HTTP requests hitting its proxy, not internal process activity. Confirm this before relying on it.)

1. Sign up at [cron-job.org](https://cron-job.org) (free, no card required) or use Render's own native Cron Job service type as a pinger.
2. Create a scheduled job hitting the **public** URL: `https://<your-service>.onrender.com/api/health/live`.
3. Set interval to every **10 minutes** (must be under Render's 15-minute idle threshold — 10 min leaves safety margin).
4. Note this is an unsupported workaround, not an official Render feature — document it as such so future maintainers know it's a hack, not a guarantee.

**Acceptance criteria:** Watch Render's dashboard logs over a 30–40 minute window with no other traffic; confirm the service does not show a spin-down/cold-start cycle.

---

## Task 2 — Postgres-backed RemoteAuth Store for whatsapp-web.js

This is the core fix. Currently `whatsapp-engine/adapters/whatsapp-web-js.adapter.ts` (line ~96) uses:

```ts
authStrategy: new LocalAuth({ dataPath: path.resolve(this.config.sessionDataPath) })
```

`LocalAuth` writes session files to local disk only — this is what forces a QR rescan on every restart. Switch to `RemoteAuth`, which needs a **Store** object implementing four methods. There's a precedent for SQL-backed stores (`wwebjs-mysql` on npm follows this exact pattern for MySQL) — we're doing the same thing for Postgres using the app's existing TypeORM connection instead of pulling in a new dependency like Mongo.

### 2a. Create the Postgres store

**New file:** `whatsapp-engine/stores/postgres-remote-auth.store.ts`

Implement a class with these four async methods (this is the exact interface `RemoteAuth` expects):

```ts
export class PostgresRemoteAuthStore {
  constructor(private dataSource: DataSource) {}

  async sessionExists(options: { session: string }): Promise<boolean> {
    // SELECT 1 FROM wa_sessions WHERE session_name = $1
  }

  async save(options: { session: string }): Promise<void> {
    // Read the zipped session file from disk (RemoteAuth writes a temp .zip
    // before calling save), read it as a Buffer, UPSERT into wa_sessions
    // (session_name, data BYTEA, updated_at)
  }

  async extract(options: { session: string; path: string }): Promise<void> {
    // SELECT data FROM wa_sessions WHERE session_name = $1
    // Write the returned Buffer to the `path` RemoteAuth gives you —
    // RemoteAuth will unzip it from there automatically.
  }

  async delete(options: { session: string }): Promise<void> {
    // DELETE FROM wa_sessions WHERE session_name = $1
  }
}
```

### 2b. Create the table

Add a TypeORM entity or a migration for:

```sql
CREATE TABLE wa_sessions (
  session_name TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2c. Wire it into the adapter

**Edit:** `whatsapp-engine/adapters/whatsapp-web-js.adapter.ts`
- Change the import: `Client, RemoteAuth` instead of `Client, LocalAuth`.
- Replace the `LocalAuth` block with:

```ts
authStrategy: new RemoteAuth({
  clientId: this.config.sessionId, // check adapter for the right per-tenant identifier — this app is multi-tenant, so each connected WhatsApp number needs its own clientId
  store: new PostgresRemoteAuthStore(this.dataSource),
  backupSyncIntervalMs: 300000, // 5 min minimum allowed — session state can lag up to this long behind a crash
})
```

- Confirm `this.dataSource` (the TypeORM connection) is actually injectable/available in this adapter class — if not, it needs to be passed in via the module/constructor.

**Important caveats to flag to Aadesh, not silently fix:**
- `backupSyncIntervalMs` has a **5-minute floor** — if the container restarts less than 5 minutes after a session state change, that change is lost and may force a rescan anyway. This is a whatsapp-web.js library limitation, not something the store implementation can work around.
- Since Senderrr is multi-tenant, every connected WhatsApp number needs a distinct `clientId` passed to `RemoteAuth` — verify the adapter already tracks a per-tenant session ID correctly before this change, don't assume.

**Acceptance criteria:** After initial QR scan and one successful `remote_session_saved` event, manually restart the Render service (or wait for a spin-down cycle) and confirm the WhatsApp session reconnects without a QR prompt.

---

## Task 3 — End-to-End Verification

1. Deploy with Tasks 0–2 complete.
2. Scan QR to link a test WhatsApp number.
3. Confirm `wa_sessions` table in Postgres has a row for that session (`SELECT session_name, updated_at FROM wa_sessions;`).
4. Force a restart (Render Dashboard → Manual Deploy, or just wait past 15 min idle with keep-alive intentionally paused).
5. Confirm the app reconnects to WhatsApp automatically — no QR code shown, `ready` event fires.
6. Re-enable the keep-alive ping (Task 1) and confirm no spin-down occurs over an extended idle window.
7. Document the 5-minute backup-lag caveat and the 30-day free Postgres expiry in the project README so it isn't forgotten.

---

## Summary of what to hand off

| # | Task | New/Edited files |
|---|------|-------------------|
| 0 | Web service setup on Render, move DB to Postgres, remove disk | `render.yaml` |
| 1 | External keep-alive ping | none (external config) |
| 2 | Postgres RemoteAuth store | `whatsapp-engine/stores/postgres-remote-auth.store.ts` (new), `whatsapp-engine/adapters/whatsapp-web-js.adapter.ts` (edit), new TypeORM entity/migration for `wa_sessions` |
| 3 | Verification | none (testing checklist) |
