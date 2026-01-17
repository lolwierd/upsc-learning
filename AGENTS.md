# Repository Guidelines

## Project Structure

- `apps/web/`: Next.js (App Router) frontend with Tailwind (`apps/web/src/`).
- `apps/worker/`: Cloudflare Worker API (Hono) (`apps/worker/src/`).
- `packages/shared/`: shared TypeScript types/Zod schemas/constants (`packages/shared/src/`).
- `packages/db/`: Cloudflare D1 migrations (`packages/db/migrations/`).
- Monorepo tooling: `pnpm-workspace.yaml` (workspaces) + `turbo.json` (task runner).

## Build, Test, and Development Commands

- `pnpm install`: install workspace dependencies (requires Node 20+).
- `pnpm dev`: run all apps in watch mode via Turborepo.
- `pnpm build`: build all packages/apps.
- `pnpm lint`: run ESLint across the workspace.
- `pnpm type-check`: run `tsc --noEmit` across the workspace.
- `pnpm db:migrate`: apply D1 migrations (wraps `@mcqs/db`).
- App-specific examples:
  - `pnpm --filter @mcqs/web dev` (Next.js on `:3000`)
  - `pnpm --filter @mcqs/worker dev` (Wrangler dev server)

## Coding Style & Naming Conventions

- TypeScript-first, `strict` enabled (see `tsconfig.json`).
- Indentation: 2 spaces; prefer double quotes and trailing commas (match existing files).
- ESLint: `eslint.config.mjs` (repo) + `apps/web` uses `next lint`.
  - Unused params should be prefixed with `_` (allowed by lint).
- Naming: React components `PascalCase`, hooks `useThing`, route files follow Next.js conventions.

## Testing Guidelines

- No dedicated test framework is set up yet; rely on `pnpm type-check` + `pnpm lint` for CI-quality checks.
- If adding tests, keep them close to the code (e.g., `apps/worker/src/**/__tests__/*`) and document the chosen runner in the PR.

## Commit & Pull Request Guidelines

- Commit messages follow short, imperative summaries (e.g., “Fix …”, “Add …”, “Update …”).
- PRs should include: what changed, how it was tested (`pnpm lint`, `pnpm type-check`, manual steps), and screenshots for UI changes (`apps/web`).

## Configuration & Secrets

- Frontend env: copy `apps/web/.env.local.example` to `apps/web/.env.local`.
- Worker env: start from `apps/worker/wrangler.toml.example`.
- Never commit real API keys, tokens, or Cloudflare IDs.
