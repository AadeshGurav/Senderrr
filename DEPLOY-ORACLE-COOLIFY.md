# Deploy on Oracle Cloud Always Free + Coolify

> **Summary**: Spin up a free Oracle Cloud ARM VM (2 OCPU / 12 GB RAM, or up to 4 OCPU / 24 GB pooled), install Coolify (one-command self-hosted PaaS), connect your GitHub repo, and deploy — with persistent storage for WhatsApp sessions, automatic HTTPS, and Git push-to-deploy.

**No credit card bills. No trial expiry. No vendor lock-in.**

---

## Architecture

```
You (Browser)  -->  Coolify (Traefik/Caddy)  -->  Senderrr Container (port 2785)
                       |
                       +--  Persistent Docker Volume (sessions + SQLite)
                       |
                       +--  Let's Encrypt SSL (auto, free)
                       |
                       +--  GitHub auto-deploy on push
```

- **Oracle Cloud Always Free VM**: 2–4 OCPU ARM Ampere, 12–24 GB RAM, 200 GB block storage, 10 TB/month egress
- **Coolify**: Self-hosted Heroku alternative. Free, open-source, no feature limits.
- **Your app**: NestJS + Puppeteer + React dashboard, running inside a Docker container
- **Persistent storage**: Docker volumes at `/app/data/sessions` and `/app/data/media`

---

## Important: ARM vs AMD Free Tier

Oracle Cloud offers two Always Free shapes:

| Shape | OCPUs | RAM | Network | Notes |
|---|---|---|---|---|
| **ARM (Ampere A1 Flex)** | 1–4 pooled | 1–24 GB pooled | 4 Gbps | **Use this** — generous resources |
| AMD (E2.1.Micro) | 1/8 burst | 1 GB | 480 Mbps | Too small for Chromium |

**Important**: As of June 2026, Oracle halved the Always Free ARM allowance to 2 OCPU / 12 GB per account (down from 4 OCPU / 24 GB). You can still use 4 OCPUs for ~half the month, or run 2 OCPUs always-on. For a WhatsApp bot, 2 OCPUs + 12 GB is more than enough.

---

## Phase 1: Oracle Cloud Setup

### 1.1 Create an Oracle Cloud Account

1. Go to [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. Click **Start for free**
3. Sign up with your email — a credit card is required for identity verification (~$1 charge, immediately refunded)
4. After verification, you land in the OCI Console

> **Gotcha**: Oracle has become stricter about new signups. Use a real credit card and a real phone number for verification. Some virtual card numbers are rejected.

### 1.2 Create a VCN First (Critical — Fixes Public IP Bug)

Oracle Cloud has a known UI bug: the **"Automatically assign public IPv4 address"** toggle is stuck at OFF during instance creation and cannot be switched on. The workaround is to create a VCN with a public subnet first, then select it during instance creation.

1. In OCI Console, go to **Networking → Virtual Cloud Networks**
2. Click **Create Virtual Cloud Network**
3. Fill in:
   - **Name**: `openwa-vcn`
   - **CIDR Block**: `10.0.0.0/16`
   - Check **"Create Internet Gateway"**
   - Check **"Create default route table"**
   - **Subnet compartment**: Keep default
   - **Subnet type**: Regional (recommended)
   - **Subnet CIDR**: `10.0.0.0/24`
   - **Subnet name**: `public-subnet`
4. Click **Create**

### 1.3 Configure Security List (Open Required Ports)

1. In your VCN, go to **Security Lists → Default Security List**
2. Click **Add Ingress Rules** for each port you need:

| Type | Source | Destination Port(s) | Description |
|---|---|---|---|
| TCP | 0.0.0.0/0 | 22 | SSH |
| TCP | 0.0.0.0/0 | 80 | HTTP (Coolify + app) |
| TCP | 0.0.0.0/0 | 443 | HTTPS (Coolify + app) |
| TCP | 0.0.0.0/0 | 22, 80, 443 | Coolify |

3. Also add an **Egress Rule** (usually default allows all, but verify):
   - **Destination**: 0.0.0.0/0 (all traffic)

> **Why this order**: Configure the VCN and Security List **before** creating the instance. If you create the instance first and the Public IP toggle was stuck at OFF, you may have to recreate the instance or do complex VCN reassignment.

### 1.4 Create the ARM Instance

1. Go to **Compute → Instances → Create Instance**
2. Fill in:
   - **Name**: `openwa-server`
   - **Compartment**: Keep default
3. **Placement**: Keep defaults
4. **Image and Shape**:
   - Click **Edit** on the Shape section
   - **Shape**: Click **Browse all shapes**
   - Filter: **Instance type: Virtual machine**, **Shape series: Ampere**
   - Select **VM.Standard.A1.Flex** (shows "Always Free eligible" badge)
   - Set **Number of OCPUs**: `2` (or 4 if you want to use monthly allowance)
   - Set **Memory (GB)**: `12` (or 24 if using 4 OCPUs)
5. **Networking**:
   - **Virtual Cloud Network**: Select `openwa-vcn` (the one you created)
   - **Subnet**: Select `public-subnet`
   - **Public IPv4 address**: Select **"Assign a public IPv4 address"** — this now works because you created the VCN with a public subnet first
6. **Add SSH keys**:
   - Option A: **Generate an SSH key pair** — download the private key (e.g., `openwa_key.pem`) and keep it safe
   - Option B: Paste your **existing public SSH key** (from `~/.ssh/id_rsa.pub` or similar)
7. **Boot Volume**: Keep defaults (200 GB pooled free)
8. Click **Create**

> **Gotcha**: If you get **"Out of host capacity"** error for Ampere in your region, try these regions in order:
> 1. `us-ashburn-1` (Ashburn, Virginia)
> 2. `phx` (Phoenix, Arizona)
> 3. `ap-tokyo-1` (Tokyo)
> 4. `ap-seoul-1` (Seoul)
> If all are full, wait a few hours and retry — capacity is added dynamically.

### 1.5 Connect via SSH

```bash
# If you downloaded the key from Oracle
chmod 400 ~/Downloads/openwa_key.pem

# SSH in (replace with your instance's public IP)
ssh -i ~/Downloads/openwa_key.pem ubuntu@<YOUR_INSTANCE_PUBLIC_IP>
```

> **Tip**: Find your instance's public IP at **Compute → Instances → openwa-server → Public IP Address**

---

## Phase 2: Server Hardening

Once SSH'd into your Oracle VM, run these steps. Do them in order.

### 2.1 Update the System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 Set Up Firewall (UFW)

```bash
# Allow SSH (before enabling firewall — don't lock yourself out!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

### 2.3 Harden SSH (Optional but Recommended)

```bash
sudo nano /etc/ssh/sshd_config
```

Change these lines:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Then restart SSH:
```bash
sudo systemctl restart sshd
```

> **Before logging out**: Open a **new SSH terminal** and verify you can still connect with the new settings. Don't close the original session until confirmed.

### 2.4 Install Essential Tools

```bash
sudo apt install -y curl wget git jq openssl ufw fail2ban
```

### 2.5 Set Up Swap (Recommended — 2 GB)

Oracle Cloud VMs don't always have swap configured. With only 12 GB RAM and building Docker images, having swap prevents OOM crashes during builds.

```bash
# Check if swap exists
sudo swapon --show

# Create 2 GB swap file if none exists
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make swap permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Phase 3: Coolify Installation

### 3.1 Quick Install (Recommended)

Log into your Oracle VM as root:

```bash
sudo -i
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

This script will:
- Install Docker Engine (version 24+)
- Configure Docker daemon
- Set up directories at `/data/coolify`
- Install and start Coolify

> **Note**: The installer requires root access. Run as `sudo -i` or with `sudo`.

### 3.2 What the Installer Does

The install script creates:
- `/data/coolify/source/` — Coolify Docker Compose files
- `/data/coolify/ssh/keys/` — SSH keys for server management
- Docker network `coolify` (attachable)
- Docker containers: Coolify (Node.js), PostgreSQL (Coolify's DB), Redis

### 3.3 Access Coolify

After installation, the script outputs your Coolify URL:
```
Coolify is ready!
URL: http://<YOUR_INSTANCE_PUBLIC_IP>:8000
```

Visit this URL in your browser. You are redirected to a registration page.

> **⚠️ Immediately create your admin account.** If someone else accesses the registration page before you, they gain full server control.

### 3.4 Configure SSH Access for Coolify

Coolify manages your server by connecting via SSH. On the Coolify dashboard:

1. Go to **Servers → Add New Server**
2. Enter:
   - **Name**: `openwa-server`
   - **IP Address**: `<YOUR_INSTANCE_PUBLIC_IP>`
   - **User**: `ubuntu` (or `root` if you prefer — Coolify supports both)
3. For **SSH Key**: Either:
   - Paste your private key content (from `~/Downloads/openwa_key.pem`)
   - Or upload the private key file
4. Click **Validate & Save**

Coolify will SSH into your server, validate the connection, and install a lightweight agent.

### 3.5 Manual Installation (if Quick Install Fails)

If the quick install script fails, do this manually:

```bash
# 1. Create directories
sudo mkdir -p /data/coolify/{source,ssh/keys,ssh/mux,applications,databases,backups,services,proxy,webhooks-during-maintenance}
sudo mkdir -p /data/coolify/proxy/dynamic

# 2. Generate SSH key for Coolify
sudo ssh-keygen -f /data/coolify/ssh/keys/ssh-key -t ed25519 -N '' -C root@coolify

# 3. Add public key to authorized_keys
sudo cat /data/coolify/ssh/keys/ssh-key.pub | sudo tee -a ~/.ssh/authorized_keys
sudo chmod 600 ~/.ssh/authorized_keys

# 4. Download installation files
cd /data/coolify/source
sudo curl -fsSL https://cdn.coollabs.io/coolify/docker-compose.yml -o docker-compose.yml
sudo curl -fsSL https://cdn.coollabs.io/coolify/docker-compose.prod.yml -o docker-compose.prod.yml
sudo curl -fsSL https://cdn.coollabs.io/coolify/.env.production -o .env

# 5. Set permissions
sudo chown -R 9999:root /data/coolify
sudo chmod -R 700 /data/coolify

# 6. Generate secure random values
sudo sed -i "s|APP_ID=.*|APP_ID=$(openssl rand -hex 16)|g" .env
sudo sed -i "s|APP_KEY=.*|APP_KEY=base64:$(openssl rand -base64 32)|g" .env
sudo sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -base64 32)|g" .env
sudo sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -base64 32)|g" .env

# 7. Create Docker network
sudo docker network create --attachable coolify

# 8. Start Coolify
sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml up -d --pull always --remove-orphans --force-recreate
```

---

## Phase 4: Connect GitHub to Coolify

1. In Coolify dashboard, go to **Settings → GitHub** (or **Integrations**)
2. Click **Connect GitHub**
3. You are redirected to GitHub to authorize the Coolify GitHub App
4. Install the app on your repository (or select specific repos)
5. Grant repository access to your `OpenWA` repo

> **Alternative**: Use **Deploy Keys** instead of GitHub App. In your repo, go to **Settings → Deploy Keys → Add key** and paste the content of a new SSH public key. Then in Coolify, use "Private Repository (Deploy Key)" type.

---

## Phase 5: Deploy the Senderrr App

### 5.1 Create a Project in Coolify

1. In Coolify dashboard, click **New Project**
2. **Name**: `senderrr`
3. **Environment**: `production`
4. Save

### 5.2 Create the Application Resource

1. In your project, click **Add New Resource → Application**
2. **Git Repository**: Select your `OpenWA` repository
3. **Branch**: `deploy/oracle-coolify` (or `main` when merged)
4. **Authentication**: GitHub App (auto-connected)

### 5.3 Build Configuration

Choose **Dockerfile** as the build pack since the project has a custom Dockerfile:

1. **Build Pack**: `Dockerfile`
2. **Dockerfile Path**: Keep default (`Dockerfile`)
3. **Base Directory**: Keep default (root)
4. **Port**: `2785` (the port your NestJS app listens on)
5. **Health Check**: Enable it
   - **Path**: `/api/health`
   - **Port**: `2785`
   - **Interval**: `30s`
   - **Timeout**: `10s`
   - **Start Period**: `30s`
   - **Retries**: `3`

> **⚠️ Important**: Traefik (Coolify's reverse proxy) won't route traffic to your container if the health check fails. The `/api/health` endpoint in your app returns `200 OK` when the app is healthy.

### 5.4 Environment Variables

In Coolify's resource configuration, go to **Environment Variables** and add:

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `2785` | App listens on this port |
| `APP_SESSION_SECRET` | Generate a long random string | Session encryption key |
| `APP_ADMIN_USERNAME` | `admin` | Change this in production |
| `APP_ADMIN_PASSWORD` | `admin` | **Change this** — set a strong password |
| `APP_BASE_URL` | `https://your-domain.com` | Your public domain (after Phase 6) |
| `APP_WEBHOOK_URL` | `https://your-domain.com/api/whatsapp/webhook` | Public webhook endpoint |
| `PUPPETEER_ARGS` | `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu` | Chromium args for containerized environment |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` | System Chromium path |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `true` | Don't download, use system Chromium |

### 5.5 Persistent Storage (Critical)

WhatsApp sessions and SQLite data must survive redeployments. Add these persistent volumes:

In Coolify's resource configuration, go to **Persistent Storage** and add:

| Name | Source | Destination |
|---|---|---|
| `wa-sessions` | (volume) | `/app/data/sessions` |
| `wa-media` | (volume) | `/app/data/media` |
| `wa-database` | (volume) | `/app/data` |

> **Why `/app/data`**: Docker volumes in Coolify are mounted relative to the container's `/app` directory. The Dockerfile creates `./data/sessions` and `./data/media` at `/app/data/sessions` and `/app/data/media` inside the container.

### 5.6 Deploy

Click **Deploy**. Coolify will:
1. Clone the GitHub repo
2. Build the Docker image using the `Dockerfile`
3. Start the container with persistent volumes
4. Run the health check
5. Register with Traefik reverse proxy

Watch the **Logs** tab to see the build progress. Building takes 2–5 minutes on 2 OCPUs.

### 5.7 Verify Deployment

Once deployed, Coolify shows the public URL. Check:
- `https://<COOLIFY_URL>/api/health` — should return `{"status":"ok"}`
- `https://<COOLIFY_URL>/` — should show the dashboard login page

---

## Phase 6: Domain + HTTPS (Auto-SSL)

### 6.1 Add Your Domain

1. In Coolify, go to your resource → **Domains**
2. Add your domain (e.g., `wa.yourdomain.com`)
3. Coolify will show the DNS records to add:
   - **A record**: Point to your Oracle Cloud instance's public IP
   - Or **CNAME**: Point to Coolify's proxy URL

### 6.2 Configure DNS

In your domain registrar (Cloudflare, Namecheap, etc.):
- Add an **A record** pointing `wa.yourdomain.com` → `<YOUR_INSTANCE_PUBLIC_IP>`
- Or follow Coolify's CNAME instructions

### 6.3 HTTPS Auto-Certificate

Once DNS propagates (usually within minutes to hours), visit `https://wa.yourdomain.com`. Coolify automatically:
- Requests a Let's Encrypt certificate
- Installs it via Traefik
- Renews it before expiry

No manual steps needed.

> **Cloudflare users**: Set Cloudflare SSL mode to **"Full"** or **"Flexible"** to avoid conflicts with Coolify's Let's Encrypt certificate.

### 6.4 Update Environment Variables

After setting up the domain, update these environment variables in Coolify:
```
APP_BASE_URL=https://wa.yourdomain.com
APP_WEBHOOK_URL=https://wa.yourdomain.com/api/whatsapp/webhook
```

Redeploy the app to apply the changes.

---

## Phase 7: GitHub Auto-Deploy (CI/CD)

With Coolify's GitHub integration, every push to your branch automatically deploys:

1. In Coolify, go to your resource → **Settings**
2. **Auto Deploy**: Enable
3. **Branch**: Select `deploy/oracle-coolify` (or `main`)

Now every `git push` triggers:
1. Coolify pulls the new code
2. Rebuilds the Docker image
3. Does a rolling update (zero downtime)
4. Health checks the new container
5. Routes traffic to the new version

If the build or health check fails, Coolify keeps the old container running — no downtime.

---

## Phase 8: Updating the App

### Via GitHub Push (Recommended)

1. Make code changes on your local machine
2. Commit and push:
   ```bash
   git add .
   git commit -m "your changes"
   git push origin deploy/oracle-coolify
   ```
3. Coolify auto-builds and deploys

### Via Coolify Manual Deploy

1. In Coolify dashboard, go to your resource
2. Click **Deploy** (manual trigger)
3. Watch the logs for build progress

### Via Docker Compose (Advanced)

SSH into your Oracle VM:
```bash
cd /data/coolify
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
```

---

## Phase 9: Security Hardening

### Server-Level

1. **Keep the server updated**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
   Set up a weekly cron job or use `unattended-upgrades`.

2. **Fail2Ban** (already installed in Phase 2):
   ```bash
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

3. **UFW firewall** is already configured (Phase 2).

4. **Docker updates**:
   ```bash
   sudo apt install docker-ce docker-ce-cli containerd.io
   ```

### Application-Level

1. **Change default credentials**:
   - Set `APP_ADMIN_USERNAME` and `APP_ADMIN_PASSWORD` to strong unique values
   - Do this in Coolify's environment variables, not in your repo

2. **Session secret**:
   - Generate a long random string for `APP_SESSION_SECRET`
   - Never commit secrets to GitHub

3. **HTTPS**: Coolify's Let's Encrypt auto-certificates handle this.

4. **Rate limiting**: Add a `docker-compose.custom.yml` override for Traefik rate limiting headers.

---

## Troubleshooting

### "Out of host capacity" when creating instance

Oracle's ARM capacity varies by region and time. Try:
1. Different region (us-ashburn-1 → phx → ap-tokyo-1)
2. Wait 1–2 hours and retry
3. Use 2 OCPUs instead of 4 (more likely to succeed)

### Coolify doesn't start after installation

```bash
# Check container status
sudo docker ps -a

# Check Coolify logs
sudo docker logs coolify

# Restart Coolify
cd /data/coolify/source
sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml restart
```

### App container is unhealthy (health check failing)

1. Check container logs in Coolify dashboard
2. Verify `PORT` env var is set to `2785`
3. Verify health check path is `/api/health` (not `/api/health/live`)
4. Check if the app started — sometimes Chromium takes extra time

### Build fails with ARM compatibility error

If a npm package has native C++ addons that aren't built for ARM:
1. Check if the package supports ARM (`node_pre_gyp` architecture targets)
2. Some packages require rebuilding: `npm rebuild` in the Dockerfile
3. Check the Docker build logs for specific error messages

### WhatsApp sessions lost after redeploy

Ensure persistent volumes are configured correctly:
- `wa-sessions` → `/app/data/sessions`
- `wa-media` → `/app/data/media`
- `wa-database` → `/app/data`

In Coolify, verify the volumes are attached to the resource (not just configured). Check the container's `/app/data` directory after deployment.

### Oracle reclaims idle instance

Oracle's policy: truly idle Always Free instances may be reclaimed. To prevent this:
- Keep some minimal traffic (e.g., a health check cron)
- Or set up a tiny cron job: `curl -s https://wa.yourdomain.com/api/health` every 5 minutes

### Can't access Coolify dashboard (port 8000 blocked)

Check Oracle Security List:
1. Go to **Networking → Virtual Cloud Networks → openwa-vcn → Security Lists → Default Security List**
2. Verify there's an **Ingress Rule** for port 8000 (or add it):
   - Type: TCP, Source: 0.0.0.0/0, Destination Port: 8000

---

## Estimated Monthly Resource Usage

With the Senderrr app + Coolify on Oracle Always Free:

| Resource | Usage | Limit | Status |
|---|---|---|---|
| OCPUs | ~1.5 (during idle) | 2 | ✅ |
| RAM | ~2.5–4 GB | 12 GB | ✅ |
| Storage | ~5–10 GB | 200 GB | ✅ |
| Egress | <1 GB/month | 10 TB | ✅ |

Building new Docker images spikes CPU to 100% for 2–4 minutes, but stays within limits.

---

## Quick Reference

```bash
# SSH into Oracle VM
ssh -i openwa_key.pem ubuntu@<PUBLIC_IP>

# Check Coolify status
sudo docker ps

# View Coolify logs
sudo docker logs -f coolify

# View app logs
sudo docker logs -f <app-container-id>

# Restart app container
sudo docker restart <app-container-id>

# Update Coolify
cd /data/coolify/source
sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml pull
sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans

# Update app (via Docker pull)
cd /data/coolify
sudo docker compose pull senderrr
sudo docker compose up -d
```

---

## Cost Summary

| Item | Cost |
|---|---|
| Oracle Cloud Always Free VM | $0 forever |
| Coolify (self-hosted) | $0 forever |
| Domain (your registrar) | ~$10–15/year |
| Total | **~$10–15/year** |

This is the only genuinely free, production-ready option for a NestJS + Puppeteer app with persistent WhatsApp sessions.