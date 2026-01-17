# UPSC MCQ Generator

Generate and practice UPSC-style MCQ quizzes with AI.

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1
- **Cache**: Cloudflare KV
- **AI**: Cloudflare Workers AI (Llama 3.1 70B) + optional BYOK OpenAI/Gemini

## Project Structure

```
/mcqs
├── apps/
│   ├── web/                 # Next.js frontend
│   └── worker/              # Cloudflare Worker API
├── packages/
│   ├── shared/              # Shared types, Zod schemas, constants
│   └── db/                  # D1 migrations
├── turbo.json               # Turborepo config
└── pnpm-workspace.yaml      # pnpm workspaces
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Cloudflare account (for Workers, D1, KV)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment files
cp apps/web/.env.local.example apps/web/.env.local
```

### Development

```bash
# Start both frontend and API
pnpm dev

# Or start individually
pnpm --filter @mcqs/web dev
pnpm --filter @mcqs/worker dev
```

### Database Setup

1. Create a D1 database:
```bash
cd apps/worker
wrangler d1 create upsc-mcq-db
```

2. Update `wrangler.toml` with the database ID

3. Run migrations:
```bash
pnpm --filter @mcqs/db migrate:local   # Local
pnpm --filter @mcqs/db migrate:remote  # Production
```

### Deployment

**Worker (API):**
```bash
cd apps/worker
wrangler deploy
```

**Frontend:**
```bash
cd apps/web
pnpm build
# Deploy to Cloudflare Pages or Vercel
```

## Features

- **Quiz Generation**: Create UPSC-style MCQs on various subjects
- **Multiple Question Styles**: Factual, Conceptual, Statement, Match, Assertion-Reason
- **Difficulty Levels**: Easy, Medium, Hard
- **Quiz Taking**: All questions on one page, mark for review
- **Results**: Detailed explanations, filter by wrong/marked
- **History**: Track all past quizzes and scores
- **Statistics**: Performance by subject
- **BYOK**: Bring your own OpenAI/Gemini API keys

## Subjects

- History
- Geography
- Indian Polity
- Economy
- Science & Technology
- Environment & Ecology
- Art & Culture

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/quiz/generate | Generate quiz |
| GET | /api/quiz/:id | Get quiz |
| POST | /api/attempt/start | Start attempt |
| PATCH | /api/attempt/:id/answer | Save answer |
| POST | /api/attempt/:id/submit | Submit quiz |
| GET | /api/attempt/:id | Get attempt |
| GET | /api/history | Quiz history |
| GET | /api/history/review/wrong | Wrong answers |
| GET | /api/history/stats | Statistics |
| GET | /api/settings | Get settings |
| PATCH | /api/settings | Update settings |

## License

MIT
