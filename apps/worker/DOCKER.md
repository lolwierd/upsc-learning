# UPSC MCQ API - Docker Deployment

This directory contains Docker configuration for running the UPSC MCQ API as a containerized Node.js application with Cloudflare Tunnel.

## Prerequisites

- Docker and Docker Compose installed
- Cloudflare account with a domain (e.g., `lolwierd.com`)
- Google Cloud credentials (API key and/or service account)

## Quick Start

### 1. Create Cloudflare Tunnel

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks** → **Tunnels**
3. Click **Create a tunnel**
4. Name it `upsc-api`
5. Copy the tunnel token
6. In the tunnel configuration, add a public hostname:
   - Subdomain: `upsc-api`
   - Domain: `lolwierd.com`
   - Service: `http://api:3001`

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your values
vim .env
```

**Required variables:**
- `GCP_SERVICE_ACCOUNT` - JSON string of your service account key
- `CLOUDFLARE_TUNNEL_TOKEN` - The tunnel token from step 1

### 3. Start the Services

```bash
# Build and start
docker compose up -d --build

# View logs
docker compose logs -f

# Check status
docker compose ps
```

### 4. Verify

```bash
# Test local endpoint
curl http://localhost:3001/

# Test public endpoint (after DNS propagation)
curl https://upsc-api.lolwierd.com/
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Cloudflare    │────▶│   cloudflared    │────▶│   API Server    │
│     Network     │     │   (container)    │     │   (container)   │
│                 │     │                  │     │                 │
│  upsc-api.      │     │  Tunnel proxy    │     │  Hono + SQLite  │
│  lolwierd.com   │     │                  │     │  Port 3001      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  SQLite Volume  │
                                                 │  /app/data      │
                                                 └─────────────────┘
```

## Data Persistence

The SQLite database is stored in a Docker volume named `upsc-data`. To backup:

```bash
# Create a backup
docker compose exec api sqlite3 /app/data/upsc-mcq.db ".backup '/app/data/backup.db'"

# Copy backup to host
docker compose cp api:/app/data/backup.db ./backup.db
```

## Development

For local development without Docker:

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .dev.vars .env

# Start dev server
pnpm dev:node
```

## Commands

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start containers in background |
| `docker compose down` | Stop containers |
| `docker compose logs -f` | View logs |
| `docker compose restart api` | Restart API server |
| `docker compose exec api sh` | Shell into API container |

## Troubleshooting

### Tunnel not connecting
- Verify `CLOUDFLARE_TUNNEL_TOKEN` is correct
- Check cloudflared logs: `docker compose logs cloudflared`

### Database errors
- Check if volume is mounted: `docker compose exec api ls -la /app/data`
- View database: `docker compose exec api sqlite3 /app/data/upsc-mcq.db ".tables"`

### Build failures
- Ensure all workspace packages are available
- Check that `better-sqlite3` compiles (requires build tools in container)
