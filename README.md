# UPSC MCQ Generator

Generate and practice UPSC-style MCQ quizzes with AI, including year-wise UPSC PYQ papers.

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Hono API (Node runtime for local/prod Docker; Worker-style dev config also present)
- **Database**: SQLite (local Node/Docker) + D1-compatible API patterns
- **AI**: Vertex Gemini (service account based)

## Project Structure

```
/mcqs
├── apps/
│   ├── web/                 # Next.js frontend
│   └── worker/              # Cloudflare Worker API
│       └── pyqs/GS/         # PYQ assets (parsed JSON + official PDFs)
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
pnpm --filter @mcqs/worker dev:node
```

### Local Testing over Tailscale / LAN

```bash
# Backend in Docker (binds host port 3001)
docker compose -f apps/worker/docker-compose-dev.yml up -d --build

# Frontend on all interfaces
NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm --filter @mcqs/web dev -- --hostname 0.0.0.0
```

Access:
- Web: `http://<your-tailscale-ip>:3000`
- API health: `http://<your-tailscale-ip>:3001/`

### Database Setup

Run migrations:
```bash
pnpm db:migrate
```

For Node/Docker runtime, migrations are also applied automatically on backend startup.

### PYQ Support

- PYQ years: `2013–2025` GS1 Set A
- New UI entry: `/pyqs`
- Paper list API: `GET /api/pyq/papers`
- Official PDF API: `GET /api/pyq/papers/:quizId/pdf`
- Dropped questions are highlighted red, locked, explanation shown, and excluded from scoring.
- PYQ attempts are excluded from overall metrics endpoints.

### Deployment

**API (Docker/Node):**
```bash
docker compose -f apps/worker/docker-compose.yml up -d --build
```

**Frontend:**
```bash
cd apps/web
pnpm build
# Deploy to Cloudflare Pages or Vercel
```

## Features

- **Quiz Generation**: Create UPSC-style MCQs on various subjects
- **PYQ Practice**: Attempt real UPSC GS1 papers year-wise with original PDF access
- **Multiple Question Styles**: Factual, Conceptual, Statement, Match, Assertion-Reason
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
| GET | /api/pyq/papers | List PYQ papers |
| GET | /api/pyq/papers/:quizId/pdf | Stream PYQ PDF |

## License

MIT
