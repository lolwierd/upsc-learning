# UPSC MCQ API - Makefile

.PHONY: install dev build start docker-up docker-down docker-logs lint dump-server

# Install dependencies
install:
	pnpm install

# Run development server (Node.js)
dev:
	cd apps/worker && pnpm dev:node

# Build for production
build:
	pnpm build

# Start production server locally
start:
	cd apps/worker && node dist/server.js

# Docker commands
docker-up:
	cd apps/worker && docker compose up -d --build

docker-down:
	cd apps/worker && docker compose down

docker-logs:
	cd apps/worker && docker compose logs -f

# Start local LLM dump server (for development)
dump-server:
	node scripts/llm-dump-server.mjs

# Helpers
lint:
	pnpm lint

format:
	pnpm prettier --write .
