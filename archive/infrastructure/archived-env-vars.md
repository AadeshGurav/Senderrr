# Archived: Ngrok Environment Variables
#
# These environment variables were used for local development with ngrok tunneling.
# They have been archived because ngrok is only relevant for local development.
# On Render, the platform provides HTTPS endpoints automatically.
#
# Archived: 2026-07-19
# Previously in: .env (local), docker-compose.yml (ngrok service)

# ─── Ngrok Auth Token ─────────────────────────────────────────────
# Your ngrok authentication token from https://dashboard.ngrok.com/auth
# Get it at: https://dashboard.ngrok.com/get-started/your-authtoken
# Required for ngrok to create tunnels. Without it, ngrok fails.
#
# Example value: 6M57iDzVPXonDkDFngDxD_73pZ777hmic2oBVnWtXUK
NGROK_AUTH_TOKEN=your_ngrok_auth_token_here

# ─── Ngrok Static Domain (Optional) ───────────────────────────────
# A free static domain from your ngrok account (e.g., myapp.ngrok-free.app)
# Find available domains at: https://dashboard.ngrok.com/domains
# Without this, ngrok assigns a random domain each time it starts.
# Having a static domain ensures webhooks always hit the same URL.
#
# Example value: opossum-first-ghastly.ngrok-free.app
NGROK_URL=your-static-domain.ngrok-free.app

# ─── How ngrok was used ───────────────────────────────────────────
#
# The ngrok tunnel pointed http traffic from the internet to the local Docker container:
#   docker compose --profile ngrok up -d
#   → ngrok tunnel: internet → ngrok → senderrr container on port 2785
#
# This was used to:
#   1. Test incoming webhooks from WhatsApp/external services during local dev
#   2. Share the local dev app with collaborators via a public URL
#
# On Render, webhooks are configured to point to:
#   https://senderrr.onrender.com/api/webhooks/...
# No ngrok needed — Render handles HTTPS and public URL automatically.

# ─── To reactivate for local development ──────────────────────────
#
# 1. Get your ngrok auth token: https://dashboard.ngrok.com/get-started/your-authtoken
# 2. Optionally reserve a static domain: https://dashboard.ngrok.com/domains
# 3. Add to your .env file:
#      NGROK_AUTH_TOKEN=your_token_here
#      NGROK_URL=your-static-domain.ngrok-free.app   # optional but recommended
# 4. Run with ngrok tunnel: docker compose --profile ngrok up -d
# 5. Check tunnel status: http://localhost:4040 (ngrok dashboard)
# 6. Your public URL is: https://your-static-domain.ngrok-free.app (or the random one shown)