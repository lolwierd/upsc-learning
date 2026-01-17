# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UPSC MCQ Generator - An AI-powered quiz application for UPSC Civil Services exam preparation. Generates UPSC-style MCQs using Gemini AI and supports BYOK (Bring Your Own Key) for OpenAI/Gemini.

## Commands

```bash
# Development
pnpm dev                          # Start all apps (web on :3000, worker on :8787)
pnpm --filter @mcqs/web dev       # Start only frontend
pnpm --filter @mcqs/worker dev    # Start only API worker

# Build & Lint
pnpm build                        # Build all packages
pnpm lint                         # Lint all packages
pnpm type-check                   # TypeScript check all packages

# Database
pnpm db:migrate                   # Alias for local migration
pnpm --filter @mcqs/db migrate:local   # Apply migrations locally
pnpm --filter @mcqs/db migrate:remote  # Apply migrations to production

# Deployment
cd apps/worker && wrangler deploy # Deploy API to Cloudflare Workers
```

## Architecture

### Monorepo Structure (Turborepo + pnpm workspaces)

- **apps/web** (`@mcqs/web`): Next.js 15 frontend with React 19, Tailwind CSS
- **apps/worker** (`@mcqs/worker`): Cloudflare Worker API using Hono framework
- **packages/shared** (`@mcqs/shared`): Shared types, Zod schemas, constants
- **packages/db** (`@mcqs/db`): D1 migrations only

### Backend (Cloudflare Worker)

The API (`apps/worker/src/index.ts`) uses Hono with route modules:
- `routes/quiz.ts` - Quiz generation via LLM
- `routes/attempt.ts` - Quiz attempt management
- `routes/history.ts` - User quiz history and stats
- `routes/settings.ts` - User preferences and API keys

LLM integration (`services/llm.ts`): Uses Vercel AI SDK with Gemini. Prompts are extensively crafted in `prompts/index.ts` to match UPSC exam patterns.

Cloudflare bindings in `types.ts`:
- `DB`: D1 SQLite database
- `CACHE`: KV namespace
- `AI`: Workers AI (not currently used, Gemini preferred)

### Frontend (Next.js)

App Router pages:
- `/` - Home/quiz creation
- `/quiz/new` - Quiz configuration form
- `/quiz/[id]` - Take quiz
- `/quiz/[id]/results` - Results page
- `/history` - Past quizzes
- `/review` - Review wrong answers
- `/stats` - Performance statistics
- `/settings` - API key management

API client at `lib/api.ts` makes requests to the worker.

### Shared Package

- `types.ts`: All TypeScript interfaces (Quiz, Attempt, Question, etc.)
- `schemas.ts`: Zod validation schemas for API requests/responses
- `constants.ts`: Subject list, difficulties, question styles

## Database Schema

SQLite (D1) tables: `user_settings`, `quizzes`, `questions`, `attempts`, `attempt_answers`

User identification is cookie-based (no auth system).

## Environment Setup

**Web** (`apps/web/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8787
```

**Worker** (`apps/worker/wrangler.toml`): Copy from `wrangler.toml.example`, then:
1. Create D1: `npx wrangler d1 create upsc-mcq-db`
2. Create KV: `npx wrangler kv namespace create CACHE`
3. Update IDs in wrangler.toml
4. Set secrets: `npx wrangler secret put GOOGLE_API_KEY`
