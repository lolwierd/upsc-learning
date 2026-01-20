# Secrets Management Guide

## Local Development
For local development, use `.dev.vars` in this directory. This file is git-ignored and should contain your secrets in `KEY="VALUE"` format.

Example `.dev.vars`:
```
GCP_SERVICE_ACCOUNT="..."
API_KEY="local-api-key"
```

## Production
For production, **do not** put secrets in `wrangler.toml` or `.dev.vars`. Instead, use the `wrangler secret` command to upload them securely to Cloudflare.

Run these commands from your terminal (in this directory):

```bash
# Set a secret for production
pnpm wrangler secret put GCP_SERVICE_ACCOUNT --env production

# Determine if a secret is set
pnpm wrangler secret list --env production
```

## Environment Variables (Non-secret)
Non-secret configuration (like `ENVIRONMENT`, `CORS_ORIGIN`) is managed in `wrangler.toml`.
- `[vars]` block: Defaults for local development.
- `[env.production.vars]` block: Overrides for production.
