# Senderrr — Feature Breakdown for Presentation

> Senderrr is your complete WhatsApp business platform, powered by the open-source OpenWA engine. Everything below is a Senderrr feature.

---

## 1. 100% Free & Open Source (MIT License)

**Sell it as:** *"You never pay for WhatsApp API access again."*

- Zero licensing fees — competitors charge $30–$100/month
- Built on the open-source OpenWA WhatsApp engine (full source code available)
- Fork, audit, and customize freely — no vendor lock-in
- Community-driven development with 22+ documentation files

---

## 2. Self-Hosted (Your Data, Your Server)

**Sell it as:** *"WhatsApp integration without handing over your data."*

- All session data, messages, and credentials stay on YOUR infrastructure
- No cloud dependency — works even on a local machine or your own VPS
- Privacy-first: no data leaves your server unless you configure webhooks
- Deploy on-premises, in your cloud, or on any VPS

---

## 3. REST API with Full-Featured HTTP Interface

**Sell it as:** *"Any system can talk to WhatsApp through simple HTTP calls."*

- Swagger/OpenAPI docs at `/api/docs` — interactive testing right in your browser
- Standard JSON responses with proper error codes
- Session management, message sending, group operations, contacts, labels — all via REST
- Example: `POST /api/sessions/{id}/messages/send-text` sends a message instantly

---

## 4. Real-Time WebSocket Events (Socket.IO)

**Sell it as:** *"Know everything the moment it happens."*

- Live session status updates pushed to your app — no polling
- Real-time QR code streaming — users scan and connect instantly
- Subscribe to specific sessions or event types
- 11 event types: `message.received`, `message.sent`, `message.ack`, `session.status`, `session.qr`, `group.join`, `group.leave`, `group.update`, and more

---

## 5. Multi-Session Support — Run 10+ WhatsApp Accounts

**Sell it as:** *"Manage unlimited WhatsApp numbers from one dashboard."*

- Each session is fully independent — separate phone, separate account, separate use case
- Monitor all sessions from a single Senderrr dashboard
- Auto-reconnect on disconnect — up to 3 automatic attempts before showing a banner
- Session persistence survives server restarts — no re-authentication needed
- Perfect for agencies managing multiple client WhatsApp numbers

---

## 6. Complete Messaging Suite

**Sell it as:** *"Send anything to anyone, from your dashboard."*

| Message Type | Max Size | Features |
|---|---|---|
| **Text** | 65,536 chars | Supports quoted replies, @mentions, GIF playback control |
| **Image** | 16MB | JPEG/PNG/WebP/GIF with caption |
| **Video** | 64MB | MP4/3GP/AVI/MKV with caption |
| **Audio** | 16MB | Sent as audio file or voice note |
| **Document** | 100MB | PDF/DOC/XLS/PPT/ZIP |
| **Location** | — | GPS coordinates with location name and address |
| **Contact** | — | vCard contact cards |
| **Sticker** | 500KB | Static and animated WebP stickers |

**Media Input Options:** URL (recommended for large files), Base64 (for small embedded files under 5MB), or local file path on server.

---

## 7. Bulk Messaging / Mass Broadcasting

**Sell it as:** *"Send to hundreds of contacts in one API call or a few dashboard clicks."*

- Send to up to 100 recipients in a single API request
- **Template Variables** — personalize messages with `{name}`, `{date}`, and custom placeholders
- **Configurable delays** — set minimum seconds between messages to control pacing
- **Randomized jitter** — natural sending pattern reduces WhatsApp ban risk significantly
- **Batch status tracking** — monitor sent/failed/pending status per message in real time
- **Cancel mid-batch** — stop a running broadcast anytime without data loss

---

## 8. Webhook System — Real-Time Integrations

**Sell it as:** *"Plug into any workflow, automation tool, or external system."*

- 11 event types: `message.received`, `message.sent`, `message.ack`, `message.revoked`, `session.status`, `session.qr`, `session.authenticated`, `session.disconnected`, `group.join`, `group.leave`, `group.update`
- Multiple webhooks per session — route events to different systems
- **HMAC-SHA256 signature verification** — verify every payload is authentic and untampered
- **Idempotency keys** — prevent duplicate processing even if a webhook is retried
- **Exponential backoff retry** — max 3 retries on failure with increasing delays
- **Custom headers** — pass authentication tokens to downstream services
- Plugin hooks: `webhook:before`, `webhook:queued`, `webhook:delivered`, `webhook:error`

---

## 9. Enterprise-Grade Security

**Sell it as:** *"Built for production, not a demo — security you can actually rely on."*

- **API Key Authentication** — SHA-256 hashed keys (never stored in plain text)
- **Role-Based Access Control (RBAC)** — admin, operator, and viewer roles with different permissions
- **IP Whitelisting per API Key** — restrict each key to specific IP addresses only
- **CIDR notation support** — e.g., `10.0.0.0/8` locks a key to an entire network range
- **Key expiration dates** — auto-expire temporary API keys after a set date
- **Last-used timestamp tracking** — know when each key was last active
- **Helmet.js** — HTTP security headers (XSS protection, content-type sniffing protection, etc.)
- **Rate Limiting** — per-endpoint throttling (10–120 req/min depending on endpoint type)
- **CORS Configuration** — control which domains can call your API
- **Audit Logging** — track every API operation with timestamps, IP addresses, and user context
- **Input Validation** — sanitizes all inputs across the entire API

---

## 10. Senderrr Web Dashboard (React 19 + TypeScript)

**Sell it as:** *"Non-technical users manage WhatsApp completely without touching code."*

- **8 full pages covering everything:**
  1. **Dashboard Home** — system overview, stats cards, session table, quick actions
  2. **Sessions** — create, start, stop, delete sessions; real-time QR display; status filtering
  3. **Webhooks** — create/edit/delete webhooks, select event types, test endpoint button
  4. **API Keys** — generate keys with roles, copy/reveal/revoke, usage tracking
  5. **Message Tester** — send test messages of all types, see responses instantly
  6. **Logs** — search audit logs, filter by severity, CSV export, pagination
  7. **Infrastructure** — database config (SQLite/PostgreSQL), Redis status, storage, queues, server settings
  8. **Plugins** — toggle plugins, select engine type, health checks, configuration modal
- Real-time session status via Socket.IO — no page refresh needed
- Live QR code display with auto-reconnect status
- Responsive design built with Tailwind CSS

---

## 11. n8n Integration — No-Code Automation

**Sell it as:** *"Build Senderrr automations without writing a single line of code."*

- Official n8n community nodes package: `@rmyndharis/n8n-nodes-openwa` (compatible with Senderrr)
- **Senderrr Send Message Node** — trigger WhatsApp messages from any workflow
- **Senderrr Trigger Node** — start workflows on incoming WhatsApp events
- **Pre-built workflows included:**
  - Auto-reply bot
  - Lead collection → Google Sheets
  - Session monitoring → Slack alerts

---

## 12. Official SDKs (JavaScript/TypeScript + Python)

**Sell it as:** *"Integrate Senderrr into your app in 3 lines of code."*

```typescript
// JavaScript / TypeScript SDK
import { SenderrrClient } from '@senderrr/sdk';
const client = new SenderrrClient({ baseUrl: 'https://your-senderrr-server.com', apiKey: '...' });
await client.messages.sendText('session-1', { chatId: '628123456789@c.us', text: 'Hello!' });
```

```python
# Python SDK
from senderrr import SenderrrClient
client = SenderrrClient(base_url="https://your-senderrr-server.com", api_key="...")
result = client.messages.send_text("session-1", { "chatId": "628123456789@c.us", "text": "Hello!" })
```

- Type-safe client libraries for Node.js 18+ and Python 3.x
- Auto-generated from OpenAPI spec for guaranteed consistency

---

## 13. Article Scraper — Automatic Content Discovery

**Sell it as:** *"Automatically find and broadcast news or content without manual effort."*

- Scrape articles from configurable target URLs
- **Listing-based detection** — scans listing pages and discovers new article links automatically
- **Hash-based change detection** — only triggers when actual new content is found (no duplicates)
- **Extensible parser registry** — plug in custom parsers for different content sources
- **Retry failed URLs** — transient failures get automatic retry without re-scraping the listing page
- **Skip old articles** — only broadcasts content under 24 hours old (keeps your groups fresh)
- **Bullet points extraction** — pulls key highlights from articles to include in messages
- Activity logging for full audit trail of every scrape operation

---

## 14. Broadcast Campaigns with Message Editing & Deletion

**Sell it as:** *"Full campaign lifecycle management — create, monitor, correct, and stop."*

- Create and manage broadcast campaigns across unlimited WhatsApp groups
- **Retry failed messages** — automatic retry with exponential backoff (up to 3 attempts)
- **Retry all failed broadcasts** — one-click recovery across every failed campaign
- **Edit sent messages** — use WhatsApp's edit API to update message text across all groups after sending
- **Delete broadcasts** — soft-delete removes messages from all target groups completely
- **Edit history tracking** — previous text stored per broadcast for full audit trail
- **Progress tracking** — monitor status: pending → in_progress → completed / partial / failed / cancelled
- **Auto-redispatch** — catches and resumes stalled broadcasts automatically

---

## 15. Smart Anti-Ban Protection

**Sell it as:** *"Send at scale without getting your WhatsApp number banned."*

- **Jitter delays** — randomized intervals between messages simulate natural human behavior
- **Quiet hours** — automatically pause sending during configurable time windows (e.g., night hours)
- **Per-admin rate limiting** — track and throttle messages per WhatsApp account independently
- **Error classification** — categorizes failures into actionable types: `rate_limited`, `bot_detected`, `session_expired`, `group_not_found`, `timeout`, `send_failed`, `group_full`
- **Max 3 retry attempts** per message with configurable backoff delay
- **Worker session tracking** — monitor which session sent each message with full log history

---

## 16. Group Management & Community Linking

**Sell it as:** *"Organize and target your audience by community, not just one broadcast at a time."*

- Import groups directly from connected WhatsApp sessions
- Toggle groups as active/inactive — exclude broken or full groups from campaigns
- Mark groups as healthy/unhealthy — automatically route messages away from problematic groups
- Link groups to communities — group multiple WhatsApp groups under one community umbrella
- **Community-based broadcast targeting** — send to all groups in a community with a single campaign
- **Group-to-admin assignment** — distributes message load across multiple admin accounts

---

## 17. Template System — Reusable, Dynamic Message Templates

**Sell it as:** *"Write once, personalize for thousands."*

- Create message templates with placeholders: `{title}`, `{description}`, `{bullets}`, `{url}`, `{imageUrl}`, `{source}`, `{publishedAt}`, `{time}`
- Set one active template — all broadcasts use it automatically
- **Dynamic rendering** — placeholders filled with real article data at send time
- **Bullet point formatting** — extracted highlights automatically formatted with `•` bullets
- Preview rendered output before sending

---

## 18. Plugin Architecture — Extend Without Touching Core Code

**Sell it as:** *"Add new capabilities without modifying Senderrr's core."*

- **HookManager** — central hook system that plugins tap into
- **PluginLoaderService** — auto-loads plugins from the `plugins/` directory at startup
- Full plugin lifecycle: load → enable → disable → unload
- Hook types: `webhook:before`, `webhook:queued`, `webhook:delivered`, `webhook:error`
- Dashboard UI for plugin management — no config file editing needed
- Planned: `@senderrr/plugin-sdk` NPM package + plugin marketplace

---

## 19. Dual Database Architecture

**Sell it as:** *"Start simple on day one, scale to thousands of sessions when you're ready."*

| Database | Best For | Scaling |
|---|---|---|
| **SQLite** | Dev, personal, small operations | Single instance |
| **PostgreSQL** | Production, high-volume, multi-node | Horizontal scaling ✅ |

- **Main DB (SQLite)** — always available for boot, stores API keys and audit logs
- **Data DB** — configurable: sessions, messages, webhooks (swap SQLite for PostgreSQL anytime)
- Database migrations with TypeORM — upgrade safely without losing data
- Import/export all data as JSON for backups and migration

---

## 20. Queue-Based Processing (BullMQ + Redis)

**Sell it as:** *"Never miss a webhook delivery — every event is queued and guaranteed."*

- Webhook deliveries processed via BullMQ job queue with persistent storage
- **Exponential backoff retry** — failed deliveries automatically retried with increasing delays
- **Bull Board UI** — visual dashboard for monitoring queue health, job counts, and retries
- Graceful shutdown — completes all pending jobs before stopping the server
- Configurable retry count, delay, and timeout per webhook

---

## 21. S3/MinIO Cloud Storage Support

**Sell it as:** *"Handle media at scale without filling up your server disk."*

- Local file storage (default, great for dev and small setups)
- **S3/MinIO integration** — store all media in the cloud
- Works with AWS S3, MinIO (self-hosted S3-compatible), DigitalOcean Spaces, and any S3-compatible provider
- Up to 100MB file uploads supported
- Media URLs cached and served efficiently

---

## 22. Docker & Docker Compose Deployment

**Sell it as:** *"Up and running in one command, on any server."*

- **Official Docker Image** — ARM64 + x86_64 support (works on Apple Silicon, x86 VPS, ARM servers)
- **3 deployment modes:**
  - **Minimal:** SQLite, no Docker services — fastest setup, ~2 minutes to running
  - **Full Stack:** Traefik + API + Dashboard — production-ready with SSL termination
  - **Development:** Docker-based dev environment — consistent across entire team
- Pre-bootstrapped PostgreSQL orchestration
- Health check endpoints for all services
- Graceful shutdown handling — no data loss on restart

---

## 23. Message Editing & Deletion

**Sell it as:** *"Made a mistake? Correct it instantly across every group."*

- **Edit messages** — use WhatsApp's native edit API to update text after sending
- **Delete messages** — remove messages from groups (both Senderrr record and WhatsApp itself)
- **Edit history** — previous text versions stored per broadcast for audit and compliance

---

## 24. WhatsApp Link Preview Pre-Warming

**Sell it as:** *"Your links always look professional — every time, in every group."*

- Pre-warm WhatsApp's server-side link preview cache before broadcasting
- Makes link previews consistent across all groups simultaneously
- **Rich thumbnails** — auto-rendered from OG meta tags (title, description, image)
- WhatsApp Web generates previews automatically from URLs — no extra configuration needed

---

## 25. Advertisements & Media Attachments

**Sell it as:** *"Rich marketing content that stands out in any chat."*

- Create and manage advertisement entries with metadata
- Media attachments with captions — images and videos with custom text overlay
- Advertisements can be used as content sources for broadcast campaigns
- Track which advertisements were used in which campaigns

---

## 26. Scheduler — Cron-Based Automation

**Sell it as:** *"Set your campaigns once, let Senderrr run them on schedule."*

- Schedule broadcast campaigns to execute at specific times automatically
- Cron-based timing configuration — precise control (e.g., "every day at 9 AM" or "every Monday at 6 PM")
- Automated execution — no manual triggers needed after scheduling

---

## 27. Multi-Admin Account Management

**Sell it as:** *"Run a full WhatsApp operations team from one platform."*

- Multiple admin accounts with individual credentials
- **Session health monitoring** — each admin sees their own sessions' status
- **Worker session tracking** — per-admin message counts, failure rates, last-sent timestamps
- **Warm-up day tracking** — new WhatsApp accounts tracked for gradual activity ramp-up
- Admin-specific stats: total sent, total failed, success rate per admin

---

## 28. Experimental Features — Forward-Looking Roadmap

- **Status API** — Send WhatsApp Status updates (experimental, engine-limited by WhatsApp Web)
- **Channels API** — WhatsApp Channels support (experimental, subject to engine availability)
- **Catalog API** — Product catalog integration (experimental)
- **Admin Authentication System** — Multi-admin login with session isolation

---

## 29. Developer Experience

**Sell it as:** *"Built by developers, for developers — but usable by everyone."*

- **TypeScript throughout** — backend (NestJS) + frontend (React) for full type safety
- **NestJS** — enterprise-grade backend architecture with dependency injection
- **Modular design** — clean separation between auth, sessions, messages, webhooks, campaigns
- **300-line max file size rule** — enforces clean, maintainable, unit-testable code
- ESLint + Prettier formatting — consistent code style across all contributors
- Hot-reload in development — instant feedback without restarting
- Swagger documentation auto-generated from code — always up to date
- Structured logging with timestamps, context, and severity levels

---

## 30. Complete Documentation Suite (22 Files)

**Sell it as:** *"You never get stuck — every answer is one document away."*

- Project Overview, Requirements Specification, System Architecture
- Security Design, Database Design, API Specification
- API Collection (Postman-ready with example requests)
- Development Guidelines, Testing Strategy
- DevOps & Infrastructure, Docker Guide (Indonesian translation included)
- Operational Runbooks, Troubleshooting FAQ, Horizontal Scaling Guide, Migration Guide
- Project Roadmap, Risk Management
- Dashboard Design, SDK Design, Plugin Architecture
- Community Guidelines, Glossary, n8n Integration Guide

---

## 31. Cost Comparison — The Killer Pitch

| Feature | **Senderrr** | WAHA Plus | Whapi.cloud | Green API |
|---|---|---|---|---|
| **Price** | **FREE** | $50+/mo | $30+/mo | $30+/mo |
| Open Source Engine | ✅ | ❌ | ❌ | ❌ |
| Self-Hosted | ✅ | ✅ | ❌ | ❌ |
| Full Dashboard UI | ✅ | ✅ | ✅ | ✅ |
| PostgreSQL Support | ✅ | ✅ | N/A | N/A |
| Webhook UI | ✅ | ✅ | ✅ | ✅ |
| n8n Integration | ✅ | ❌ | ❌ | ❌ |
| Article Scraper | ✅ | ❌ | ❌ | ❌ |
| Anti-Ban Features | ✅ | ❌ | ❌ | ❌ |
| Message Editing | ✅ | ❌ | ❌ | ❌ |
| Community/Group Management | ✅ | ❌ | ❌ | ❌ |
| Bulk Messaging | ✅ | ✅ | ✅ | ✅ |
| Real-time WebSocket Events | ✅ | ✅ | ✅ | ✅ |
| Docker Deployment | ✅ | ❌ | ❌ | ❌ |
| Multi-Admin Support | ✅ | ❌ | ❌ | ❌ |

**Bottom line:** Senderrr gives you everything competitors charge $30–$100/month for — for free, self-hosted, with a full dashboard. The underlying OpenWA engine is open source, so you're never locked in.

---

*Generated for Senderrr presentation — 2026-07-13*