# UPSC MCQ Generator - Project Context

## Overview
A web app to generate and practice UPSC-style MCQ quizzes using AI (Gemini).

**Owner:** Dhrumil
**Created:** January 17, 2026
**Status:** MVP working locally

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Cloudflare Workers (Hono framework) |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| AI | Google Gemini 3 Flash Preview (via Vercel AI SDK) |
| Auth | Cloudflare Access (external, not built into app) |

---

## Project Structure

```
/MCQs
├── apps/
│   ├── web/                    # Next.js frontend (port 3000)
│   │   ├── src/app/            # Pages (App Router)
│   │   │   ├── page.tsx        # Dashboard (with charts)
│   │   │   ├── quiz/new/       # Create quiz form
│   │   │   ├── quiz/[id]/      # Take quiz
│   │   │   ├── quiz/[id]/results/ # Quiz results
│   │   │   ├── history/        # Past quizzes
│   │   │   ├── stats/          # Performance stats (with timeline)
│   │   │   └── settings/       # API keys, preferences
│   │   ├── src/components/     # UI components
│   │   │   ├── ui/             # Reusable UI (Button, Card, CheckboxGroup, etc.)
│   │   │   ├── ContributionGraph.tsx  # GitHub-style activity heatmap
│   │   │   └── PerformanceGraph.tsx   # Correct/wrong line chart
│   │   └── src/lib/            # API client, utils
│   └── worker/                 # Cloudflare Worker API (port 8787)
│       ├── src/routes/         # API endpoints
│       ├── src/services/       # LLM integration
│       ├── src/prompts/        # Question generation prompts
│       └── src/middleware/     # Turnstile, rate limiting
├── packages/
│   ├── shared/                 # Types, Zod schemas, constants
│   └── db/                     # D1 migrations
└── (config files)
```

---

## Key Decisions Made

1. **AI Model:** Uses **Gemini 3 Flash Preview** only (Cloudflare AI removed)
   - Server has default GOOGLE_API_KEY
   - Users can optionally add their own key in Settings
   - Model: `gemini-3-flash-preview`

2. **Quiz Format:** All questions on one scrollable page (not one-at-a-time)

3. **Timer:** Passive time tracking (no countdown pressure)

4. **Auth:** Handled externally by Cloudflare Access (not built into app)

5. **Current Affairs:** Skipped for v1 due to knowledge cutoff issues

6. **Multiple Styles:** Quizzes can have multiple question styles (stored as JSON array in `style` column)

7. **Question Count:** Supports 1-500 questions per quiz

---

## Database Schema (D1)

Tables:
- `user_settings` - API keys, preferences
- `quizzes` - Quiz metadata (subject, theme, difficulty, style as JSON array)
- `questions` - Generated questions with options/answers
- `attempts` - Quiz attempts with scores
- `attempt_answers` - Individual answers per attempt

**Important:**
- `is_correct` stored as INTEGER (0/1), convert to boolean in API responses
- `style` column stores JSON array for multiple styles (backwards compatible with old single string)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/quiz/generate | Generate quiz with Gemini |
| GET | /api/quiz/:id | Get quiz questions |
| POST | /api/attempt/start | Start quiz attempt |
| PATCH | /api/attempt/:id/answer | Save answer |
| POST | /api/attempt/:id/submit | Submit & grade |
| GET | /api/attempt/:id | Get results |
| GET | /api/history | Quiz history |
| GET | /api/history/activity | Daily activity for contribution graph |
| GET | /api/history/stats | Performance stats |
| GET | /api/history/stats/timeline | Quizzes grouped by date |
| GET/PATCH | /api/settings | User settings |
| DELETE | /api/settings/key/:type | Reset API key (openai/gemini) |

---

## Running Locally

```bash
# Install dependencies
pnpm install

# Apply database migrations
cd apps/worker
npx wrangler d1 migrations apply upsc-mcq-db --local

# Start both servers (from root)
# Terminal 1 - API
cd apps/worker && pnpm dev

# Terminal 2 - Frontend
cd apps/web && pnpm dev
```

**URLs:**
- Frontend: http://localhost:3000
- API: http://localhost:8787

**First time setup:**
1. Go to Settings
2. Optionally add your own Gemini API key (or use server default)
3. Create a quiz

---

## Common Issues & Fixes

### "Failed to generate quiz"
- Check if Gemini API key is set (either user's or server's GOOGLE_API_KEY)
- Check worker logs: `tail -50 /path/to/worker/output`

### Wrong answers showing as 0
- Fixed: `is_correct` was returning 0/1, now converts to boolean
- Location: `apps/worker/src/routes/attempt.ts` line ~214

### Model not found error
- Use `gemini-3-flash-preview` (not deprecated models)
- Location: `apps/worker/src/services/llm.ts`

### Styles not showing correctly
- Old quizzes have single style string, new ones have JSON array
- `parseStyles()` helper handles both formats

---

## Subjects Available

- History
- Geography
- Indian Polity
- Economy
- Science & Technology
- Environment & Ecology
- Art & Culture

## Question Styles (Multiple Selection Allowed)

- **Factual** - Direct fact-based questions
- **Conceptual** - Understanding-based questions
- **Statement** - Statement I & II evaluation
- **Match** - Match the following columns
- **Assertion** - Assertion-Reason relationship

All styles selected by default when creating a quiz. Questions distributed evenly across selected styles.

## Difficulty Levels

- Easy, Medium, Hard

---

## Files to Know

| File | Purpose |
|------|---------|
| `apps/worker/src/services/llm.ts` | Gemini API integration, handles style distribution |
| `apps/worker/src/prompts/index.ts` | Question generation prompts for multiple styles |
| `apps/worker/src/routes/quiz.ts` | Quiz generation, stores styles as JSON |
| `apps/worker/src/routes/attempt.ts` | Quiz taking & grading |
| `apps/worker/src/routes/history.ts` | Activity & timeline endpoints |
| `apps/worker/src/routes/settings.ts` | Settings with key reset |
| `apps/web/src/app/page.tsx` | Dashboard with stats & charts |
| `apps/web/src/app/quiz/new/page.tsx` | Quiz form with checkboxes & number input |
| `apps/web/src/app/stats/page.tsx` | Stats with timeline view |
| `apps/web/src/components/ContributionGraph.tsx` | GitHub-style activity heatmap |
| `apps/web/src/components/PerformanceGraph.tsx` | Correct/wrong over time |
| `apps/web/src/components/ui/CheckboxGroup.tsx` | Multi-select checkbox component |
| `packages/shared/src/constants.ts` | All constants/labels, MIN/MAX_QUESTION_COUNT |

---

## Recent Changes (January 17, 2026)

### UI Improvements
1. **Removed Review tab** from navigation (functionality merged into Stats)
2. **Removed left border** from results cards (kept numbered badge colors)
3. **Dashboard now shows real stats** from API (was hardcoded 0)
4. **Dashboard has two charts:**
   - Contribution graph (GitHub-style, color = accuracy)
   - Performance graph (cumulative correct/wrong with time range selector)

### Quiz Creation
5. **Question count: 1-500** using number input (was buttons 5-30)
6. **Multiple styles selection** with checkboxes, all selected by default

### Settings
7. **Removed Cloudflare AI option** (only Gemini and OpenAI now)
8. **Gemini is default** and uses server key if user hasn't set one
9. **Reset key buttons** to clear saved keys and use defaults

### Stats Page
10. **Timeline view** showing quizzes grouped by date with scores

### API Changes
- `styles` is now array in request/response (was `style` string)
- New endpoints: `/activity`, `/stats/timeline`, `DELETE /settings/key/:type`
- Question count validation: 1-500 (was 5-30)
- Model providers: `["gemini", "openai"]` (removed "cloudflare")

---

## Future Improvements (Not Done Yet)

- [ ] Deploy to Cloudflare (Workers + Pages)
- [ ] Add Turnstile bot protection
- [ ] Current affairs with news API
- [ ] Multi-correct question support
- [ ] Offline mode with service worker
- [ ] Question bank to save good questions

---

## Notes for Claude

- User is non-technical, explain things simply
- Always use Gemini (not Cloudflare AI) - removed from codebase
- Styles are stored as JSON array in DB, use `parseStyles()` helper
- Test changes by checking browser at localhost:3000
- Check worker logs for API errors
- Database is local SQLite via D1 simulation
- When reading styles from DB, handle both old string format and new JSON array
