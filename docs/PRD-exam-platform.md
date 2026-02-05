# PRD: Proctora - Multi-App Exam Platform

## Executive Summary

Transform the current single-app MCQ Generator into **Proctora**, a three-part B2B SaaS exam platform:
1. **Dashboard App** (`dashboard.proctora.io`) - For teachers/examiners to create quizzes and manage students
2. **Exam App** (`exam.proctora.io`) - For students to take assigned tests
3. **Separate Backend APIs** - Independent API services for each frontend

Each customer deployment is isolated (single-tenant). While initially built for UPSC preparation, the platform is designed to support any exam type.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (Static Export), React 19, Tailwind CSS |
| Frontend Hosting | Cloudflare Pages |
| Backend | Hono (Node.js), TypeScript |
| Backend Hosting | Docker, Docker Compose |
| Database | PostgreSQL (Docker) |
| ORM | Drizzle ORM (or Prisma) |
| Auth | Google OAuth 2.0, JWT |
| API Routing | Cloudflare Tunnels |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Cloudflare Pages                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────┐              ┌──────────────────┐                │
│   │   Dashboard App  │              │     Exam App     │                │
│   │  (Static Files)  │              │  (Static Files)  │                │
│   │                  │              │                  │                │
│   │  • Quiz Creation │              │  • Take Tests    │                │
│   │  • Student Mgmt  │              │  • View Results  │                │
│   │  • Analytics     │              │  • History       │                │
│   │  • Class Mgmt    │              │                  │                │
│   │                  │              │                  │                │
│   │ dashboard.proctora.io           │ exam.proctora.io │                │
│   └────────┬─────────┘              └────────┬─────────┘                │
│            │                                  │                          │
└────────────┼──────────────────────────────────┼──────────────────────────┘
             │                                  │
             │         API Calls (HTTPS)        │
             │                                  │
┌────────────┼──────────────────────────────────┼──────────────────────────┐
│            ▼                                  ▼                          │
│   ┌──────────────────┐              ┌──────────────────┐                │
│   │  Dashboard API   │              │     Exam API     │                │
│   │  (Hono/Node.js)  │              │  (Hono/Node.js)  │                │
│   │                  │              │                  │                │
│   │  • Teacher Auth  │              │  • Student Auth  │                │
│   │  • Quiz CRUD     │              │  • Take Quiz     │                │
│   │  • Student Mgmt  │              │  • Submit Answer │                │
│   │  • Assignments   │              │  • View Results  │                │
│   │                  │              │                  │                │
│   │  Port: 4000      │              │  Port: 4001      │                │
│   └────────┬─────────┘              └────────┬─────────┘                │
│            │                                  │                          │
│            └──────────────┬───────────────────┘                          │
│                           ▼                                              │
│                  ┌──────────────────┐                                    │
│                  │    PostgreSQL    │                                    │
│                  │    Port: 5432    │                                    │
│                  └──────────────────┘                                    │
│                                                                          │
│                    Docker Host (Your Server)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  Cloudflare Tunnels expose APIs:                                         │
│    • api-dashboard.proctora.io → localhost:4000                          │
│    • api-exam.proctora.io      → localhost:4001                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture (Cloudflare Pages)

Both frontend apps are **fully static** and hosted on **Cloudflare Pages**:

- **No API routes** in Next.js - all API calls go to separate backend services
- **No SSR** - pages are pre-rendered at build time
- **Client-side data fetching** - use React Query/SWR for API calls
- **Static export** via `output: 'export'` in next.config.js
- **Hosted on Cloudflare Pages** - free, global CDN, automatic deployments

### next.config.js (for both apps)

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,  // Required for static export
  },
}

module.exports = nextConfig
```

### Cloudflare Pages Setup

Each frontend is a separate CF Pages project:

| App | CF Pages Project | Custom Domain |
|-----|------------------|---------------|
| Dashboard | `proctora-dashboard` | `dashboard.proctora.io` |
| Exam | `proctora-exam` | `exam.proctora.io` |

**Build settings:**
- Build command: `pnpm --filter @proctora/dashboard build`
- Output directory: `apps/dashboard/out`
- Node version: 20

### Benefits

- **Free hosting** - Cloudflare Pages free tier is generous
- **Global CDN** - static assets served from edge locations worldwide
- **Automatic deployments** - push to main = deploy
- **No cold starts** - instant page loads
- **Zero server management** - no Docker needed for frontend

---

## Monorepo Structure (New)

```
proctora/
├── apps/
│   ├── dashboard/              # Teacher/Admin frontend (CF Pages)
│   │   └── @proctora/dashboard
│   ├── exam/                   # Student frontend (CF Pages)
│   │   └── @proctora/exam
│   ├── api-dashboard/          # Teacher API (Docker)
│   │   ├── Dockerfile
│   │   └── @proctora/api-dashboard
│   └── api-exam/               # Student API (Docker)
│       ├── Dockerfile
│       └── @proctora/api-exam
├── packages/
│   ├── shared/                 # Shared types, schemas, constants
│   │   └── @proctora/shared
│   ├── db/                     # Drizzle schema & migrations
│   │   └── @proctora/db
│   ├── ui/                     # Shared UI components
│   │   └── @proctora/ui
│   └── auth/                   # Shared auth utilities (client-side)
│       └── @proctora/auth
├── docker-compose.yml          # APIs + PostgreSQL
└── docker-compose.dev.yml      # Development overrides
```

---

## Database Schema (PostgreSQL)

### New Tables

```sql
-- Users (both teachers and students)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
  google_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student allowlist (teachers pre-register student emails)
CREATE TABLE student_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  registered_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(email, teacher_id)
);

-- Classes/Groups
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Class membership
CREATE TABLE class_students (
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (class_id, student_id)
);

-- Quiz assignments
CREATE TABLE quiz_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  assignment_type VARCHAR(20) NOT NULL CHECK (assignment_type IN ('student', 'class', 'all')),
  assigned_to_id UUID,  -- NULL if type='all', student_id or class_id otherwise
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  due_date TIMESTAMP WITH TIME ZONE,
  UNIQUE(quiz_id, assignment_type, assigned_to_id)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_student_allowlist_email ON student_allowlist(email);
CREATE INDEX idx_quiz_assignments_quiz_id ON quiz_assignments(quiz_id);
CREATE INDEX idx_class_students_student_id ON class_students(student_id);
```

### Modified Tables

```sql
-- Add teacher reference to quizzes
ALTER TABLE quizzes ADD COLUMN created_by UUID REFERENCES users(id);

-- Add user reference to attempts (replace anonymous cookie-based)
ALTER TABLE attempts ADD COLUMN user_id UUID REFERENCES users(id);

-- Migrate user_settings to link with users table
ALTER TABLE user_settings ADD COLUMN user_id UUID REFERENCES users(id);
```

---

## App Specifications

### 1. Dashboard App (`@proctora/dashboard`)

**Purpose**: Teacher/examiner interface for quiz management

**Type**: Static SPA (Single Page Application)

**Pages**:
| Route | Description |
|-------|-------------|
| `/` | Dashboard home - overview stats |
| `/login` | Google OAuth login |
| `/quizzes` | List all created quizzes |
| `/quizzes/new` | Create new quiz (AI generation) |
| `/quizzes/[id]` | View/edit quiz details |
| `/quizzes/[id]/assign` | Assign quiz to students/classes |
| `/quizzes/[id]/results` | View all student attempts |
| `/students` | Manage student allowlist |
| `/students/invite` | Add students to allowlist |
| `/classes` | Manage classes |
| `/classes/[id]` | View class details & students |
| `/analytics` | Performance analytics |
| `/settings` | API keys, preferences |

**Key Features**:
- Google OAuth (teacher role only)
- AI-powered quiz generation (existing functionality)
- Student email allowlist management
- Class/group creation and management
- Quiz assignment (to student/class/all)
- View all student attempts and scores
- Export results (future)

---

### 2. Exam App (`@proctora/exam`)

**Purpose**: Student interface for taking tests

**Type**: Static SPA (Single Page Application)

**Pages**:
| Route | Description |
|-------|-------------|
| `/` | Student dashboard - assigned tests |
| `/login` | Google OAuth login (must be in allowlist) |
| `/tests` | List of assigned tests |
| `/tests/[id]` | Take a test |
| `/tests/[id]/results` | View test results |
| `/history` | Past attempts |
| `/profile` | Student profile |

**Key Features**:
- Google OAuth (student role - must be in allowlist)
- View assigned tests only
- Take tests with clean, focused UI
- View results and explanations after submission
- Track personal history and progress
- **No quiz generation capability**

---

### 3. Dashboard API (`@proctora/api-dashboard`)

**Endpoints**:

```
Auth:
  POST   /auth/google          # Google OAuth callback
  GET    /auth/me              # Get current teacher
  POST   /auth/logout          # Logout

Quizzes:
  GET    /quizzes              # List teacher's quizzes
  POST   /quizzes              # Create quiz (AI generation)
  GET    /quizzes/:id          # Get quiz details
  PUT    /quizzes/:id          # Update quiz
  DELETE /quizzes/:id          # Delete quiz

Assignments:
  POST   /quizzes/:id/assign   # Assign quiz
  GET    /quizzes/:id/assignments  # List assignments
  DELETE /assignments/:id      # Remove assignment

Students:
  GET    /students             # List allowlisted students
  POST   /students             # Add to allowlist (single or bulk)
  DELETE /students/:id         # Remove from allowlist
  GET    /students/:id/attempts # View student's attempts

Classes:
  GET    /classes              # List classes
  POST   /classes              # Create class
  GET    /classes/:id          # Get class details
  PUT    /classes/:id          # Update class
  DELETE /classes/:id          # Delete class
  POST   /classes/:id/students # Add students to class
  DELETE /classes/:id/students/:studentId  # Remove student

Analytics:
  GET    /analytics/overview   # Dashboard stats
  GET    /analytics/quiz/:id   # Quiz performance stats

Settings:
  GET    /settings             # Get settings
  PUT    /settings             # Update settings (API keys, etc.)
```

---

### 4. Exam API (`@proctora/api-exam`)

**Endpoints**:

```
Auth:
  POST   /auth/google          # Google OAuth (validates allowlist)
  GET    /auth/me              # Get current student
  POST   /auth/logout          # Logout

Tests:
  GET    /tests                # List assigned tests
  GET    /tests/:id            # Get test details (questions)
  POST   /tests/:id/start      # Start attempt
  POST   /tests/:id/submit     # Submit answers
  GET    /tests/:id/results    # Get results (after submission)

History:
  GET    /history              # Past attempts
  GET    /history/:attemptId   # Attempt details

Profile:
  GET    /profile              # Student profile
  PUT    /profile              # Update profile
```

---

## Authentication Flow

### Teacher Login (Dashboard)
```
1. Teacher clicks "Login with Google"
2. Frontend redirects to Google OAuth
3. Google redirects back to frontend with code
4. Frontend sends code to API
5. API exchanges code for tokens
6. API creates/updates user with role='teacher'
7. API returns JWT token
8. Frontend stores token in localStorage, redirects to home
```

### Student Login (Exam App)
```
1. Student clicks "Login with Google"
2. Frontend redirects to Google OAuth
3. Google redirects back to frontend with code
4. Frontend sends code to API
5. API exchanges code for tokens
6. API checks if email is in student_allowlist
   - If NOT: Return error "Not authorized. Contact your teacher."
   - If YES: Create/update user with role='student'
7. API returns JWT token
8. Frontend stores token in localStorage, redirects to tests
```

---

## Docker Configuration (APIs + Database Only)

Frontends are hosted on Cloudflare Pages. Docker only runs the APIs and PostgreSQL.

### docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: proctora
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: proctora
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U proctora"]
      interval: 5s
      timeout: 5s
      retries: 5

  api-dashboard:
    build:
      context: .
      dockerfile: apps/api-dashboard/Dockerfile
    environment:
      DATABASE_URL: postgresql://proctora:${DB_PASSWORD}@postgres:5432/proctora
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      JWT_SECRET: ${JWT_SECRET}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy

  api-exam:
    build:
      context: .
      dockerfile: apps/api-exam/Dockerfile
    environment:
      DATABASE_URL: postgresql://proctora:${DB_PASSWORD}@postgres:5432/proctora
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "4001:4001"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

### Example API Dockerfile

```dockerfile
# apps/api-dashboard/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY apps/api-dashboard ./apps/api-dashboard
COPY packages ./packages

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @proctora/api-dashboard build

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/apps/api-dashboard/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000
CMD ["node", "dist/index.js"]
```

---

## Cloudflare Tunnel Configuration (APIs Only)

Frontends are on CF Pages. Tunnels only expose the APIs:

```yaml
# ~/.cloudflared/config.yml
tunnel: proctora-tunnel
credentials-file: /root/.cloudflared/credentials.json

ingress:
  - hostname: api-dashboard.proctora.io
    service: http://localhost:4000
  - hostname: api-exam.proctora.io
    service: http://localhost:4001
  - service: http_status:404
```

---

## Migration Plan

### Phase 1: Foundation
- [ ] Rename repository from `upsc-learning` to `proctora`
- [ ] Update all package names from `@mcqs/*` to `@proctora/*`
- [ ] Set up new monorepo structure
- [ ] Migrate from SQLite to PostgreSQL
- [ ] Set up Drizzle ORM with PostgreSQL
- [ ] Create Docker configuration
- [ ] Create `@proctora/ui` shared component library
- [ ] Create `@proctora/auth` shared auth utilities
- [ ] Write new database migrations
- [ ] Set up Google OAuth credentials
- [ ] Configure Cloudflare Tunnels

### Phase 2: Dashboard App
- [ ] Create `@proctora/dashboard` app (migrate from `@proctora/web`)
- [ ] Configure as static export (no SSR, no API routes)
- [ ] Set up Cloudflare Pages project for dashboard
- [ ] Create `@proctora/api-dashboard` (migrate from Hono worker to Node.js)
- [ ] Implement teacher auth flow
- [ ] Migrate quiz creation functionality
- [ ] Add student allowlist management
- [ ] Add class management
- [ ] Add quiz assignment feature

### Phase 3: Exam App
- [ ] Create `@proctora/exam` app (static export)
- [ ] Set up Cloudflare Pages project for exam
- [ ] Create `@proctora/api-exam`
- [ ] Implement student auth flow (with allowlist check)
- [ ] Build test listing page
- [ ] Build test-taking interface
- [ ] Build results page
- [ ] Build history page

### Phase 4: Integration & Polish
- [ ] End-to-end testing
- [ ] Error handling improvements
- [ ] Loading states and UX polish
- [ ] Documentation
- [ ] Production Docker optimization (multi-stage builds)
- [ ] Health checks and logging

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://proctora:password@localhost:5432/proctora

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# JWT
JWT_SECRET=your-secret-key

# LLM (for quiz generation)
GOOGLE_API_KEY=xxx  # Gemini API key
```

### Frontend Build-time Variables

```env
# Set at build time for static export
NEXT_PUBLIC_API_URL=https://api-dashboard.proctora.io
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

---

## Open Questions / Future Considerations

1. **Test timing/proctoring** - Deferred, add later (fits the Proctora brand!)
2. **Custom branding per deployment** - Deferred, add later
3. **Email notifications** - Should teachers get notified when students complete tests?
4. **Bulk import** - CSV upload for student allowlist?
5. **Quiz templates** - Should teachers be able to save/reuse quiz configurations?
6. **Multi-exam support** - Configurable exam types beyond UPSC (JEE, NEET, GATE, etc.)
7. **Redis** - Add Redis for caching/sessions if needed at scale
8. **Horizontal scaling** - Multiple API instances behind load balancer

---

## Summary

| Component | Package Name | Domain | Hosting | Purpose |
|-----------|--------------|--------|---------|---------|
| Dashboard Frontend | `@proctora/dashboard` | `dashboard.proctora.io` | CF Pages | Teacher quiz management |
| Exam Frontend | `@proctora/exam` | `exam.proctora.io` | CF Pages | Student test-taking |
| Dashboard API | `@proctora/api-dashboard` | `api-dashboard.proctora.io` | Docker | Teacher API |
| Exam API | `@proctora/api-exam` | `api-exam.proctora.io` | Docker | Student API |
| Database | PostgreSQL | - | Docker | Data storage |
| Shared UI | `@proctora/ui` | - | - | Reusable components |
| Shared Auth | `@proctora/auth` | - | - | Client-side auth utilities |
| Shared Types | `@proctora/shared` | - | - | Types, schemas |
| DB Package | `@proctora/db` | - | - | Drizzle schema & migrations |
