# PRD: UPSC Exam Platform - Multi-App Architecture

## Executive Summary

Transform the current single-app UPSC MCQ Generator into a three-part B2B SaaS platform:
1. **Dashboard App** (`dashboard.example.com`) - For teachers/examiners to create quizzes and manage students
2. **Exam App** (`exam.example.com`) - For students to take assigned tests
3. **Separate Backend APIs** - Independent API workers for each frontend

Each customer deployment is isolated (single-tenant).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Customer Deployment                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────┐         ┌──────────────────┐             │
│   │   Dashboard App  │         │     Exam App     │             │
│   │   (Next.js 15)   │         │   (Next.js 15)   │             │
│   │                  │         │                  │             │
│   │  • Quiz Creation │         │  • Take Tests    │             │
│   │  • Student Mgmt  │         │  • View Results  │             │
│   │  • Analytics     │         │  • History       │             │
│   │  • Class Mgmt    │         │                  │             │
│   └────────┬─────────┘         └────────┬─────────┘             │
│            │                            │                        │
│            ▼                            ▼                        │
│   ┌──────────────────┐         ┌──────────────────┐             │
│   │  Dashboard API   │         │     Exam API     │             │
│   │ (Cloudflare W.)  │         │ (Cloudflare W.)  │             │
│   │                  │         │                  │             │
│   │  • Teacher Auth  │         │  • Student Auth  │             │
│   │  • Quiz CRUD     │         │  • Take Quiz     │             │
│   │  • Student Mgmt  │         │  • Submit Answer │             │
│   │  • Assignments   │         │  • View Results  │             │
│   └────────┬─────────┘         └────────┬─────────┘             │
│            │                            │                        │
│            └──────────┬─────────────────┘                        │
│                       ▼                                          │
│              ┌──────────────────┐                                │
│              │   Cloudflare D1  │                                │
│              │    (SQLite DB)   │                                │
│              └──────────────────┘                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure (New)

```
upsc-learning/
├── apps/
│   ├── dashboard/          # Teacher/Admin frontend (NEW - migrate from web)
│   │   └── @mcqs/dashboard
│   ├── exam/               # Student frontend (NEW)
│   │   └── @mcqs/exam
│   ├── api-dashboard/      # Teacher API (NEW - split from worker)
│   │   └── @mcqs/api-dashboard
│   └── api-exam/           # Student API (NEW - split from worker)
│       └── @mcqs/api-exam
├── packages/
│   ├── shared/             # Shared types, schemas, constants (EXISTING)
│   ├── db/                 # D1 migrations (EXISTING - expanded)
│   ├── ui/                 # Shared UI components (NEW)
│   │   └── @mcqs/ui
│   └── auth/               # Shared Google OAuth logic (NEW)
│       └── @mcqs/auth
└── tooling/                # Shared configs (optional)
```

---

## Database Schema Changes

### New Tables

```sql
-- Users (both teachers and students)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  google_id TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Student allowlist (teachers pre-register student emails)
CREATE TABLE student_allowlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES classes(id),  -- optional: auto-assign to class
  invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  registered_at DATETIME,  -- set when student signs up
  UNIQUE(email, teacher_id)
);

-- Classes/Groups
CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Class membership
CREATE TABLE class_students (
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, student_id)
);

-- Quiz assignments
CREATE TABLE quiz_assignments (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id),
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('student', 'class', 'all')),
  assigned_to_id TEXT,  -- NULL if type='all', student_id or class_id otherwise
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  due_date DATETIME,  -- optional deadline
  UNIQUE(quiz_id, assignment_type, assigned_to_id)
);
```

### Modified Tables

```sql
-- Add teacher reference to quizzes
ALTER TABLE quizzes ADD COLUMN created_by TEXT REFERENCES users(id);

-- Add user reference to attempts (replace anonymous cookie-based)
ALTER TABLE attempts ADD COLUMN user_id TEXT REFERENCES users(id);

-- Migrate user_settings to link with users table
ALTER TABLE user_settings ADD COLUMN user_id TEXT REFERENCES users(id);
```

---

## App Specifications

### 1. Dashboard App (`@mcqs/dashboard`)

**Purpose**: Teacher/examiner interface for quiz management

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

### 2. Exam App (`@mcqs/exam`)

**Purpose**: Student interface for taking tests

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

### 3. Dashboard API (`@mcqs/api-dashboard`)

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

### 4. Exam API (`@mcqs/api-exam`)

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
2. Redirects to Google OAuth
3. Google redirects back with code
4. API exchanges code for tokens
5. API creates/updates user with role='teacher'
6. Returns JWT/session token
7. Dashboard stores token, redirects to home
```

### Student Login (Exam App)
```
1. Student clicks "Login with Google"
2. Redirects to Google OAuth
3. Google redirects back with code
4. API exchanges code for tokens
5. API checks if email is in student_allowlist
   - If NOT: Return error "Not authorized. Contact your teacher."
   - If YES: Create/update user with role='student'
6. Returns JWT/session token
7. Exam app stores token, redirects to tests
```

---

## Migration Plan

### Phase 1: Foundation
- [ ] Set up new monorepo structure
- [ ] Create `@mcqs/ui` shared component library
- [ ] Create `@mcqs/auth` shared auth package
- [ ] Write new database migrations
- [ ] Set up Google OAuth credentials

### Phase 2: Dashboard App
- [ ] Create `@mcqs/dashboard` app (migrate from `@mcqs/web`)
- [ ] Create `@mcqs/api-dashboard` worker
- [ ] Implement teacher auth flow
- [ ] Migrate quiz creation functionality
- [ ] Add student allowlist management
- [ ] Add class management
- [ ] Add quiz assignment feature

### Phase 3: Exam App
- [ ] Create `@mcqs/exam` app
- [ ] Create `@mcqs/api-exam` worker
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
- [ ] Deployment setup (separate wrangler configs)

---

## Deployment Configuration

Each app gets its own deployment config:

**Dashboard** (`apps/dashboard/`):
```env
NEXT_PUBLIC_API_URL=https://api-dashboard.example.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx
```

**Exam** (`apps/exam/`):
```env
NEXT_PUBLIC_API_URL=https://api-exam.example.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx
```

**API Dashboard** (`apps/api-dashboard/wrangler.toml`):
```toml
name = "api-dashboard"
[[d1_databases]]
binding = "DB"
database_id = "shared-db-id"
```

**API Exam** (`apps/api-exam/wrangler.toml`):
```toml
name = "api-exam"
[[d1_databases]]
binding = "DB"
database_id = "shared-db-id"  # Same DB!
```

---

## Open Questions / Future Considerations

1. **Test timing/proctoring** - Deferred, add later
2. **Custom branding per deployment** - Deferred, add later
3. **Email notifications** - Should teachers get notified when students complete tests?
4. **Bulk import** - CSV upload for student allowlist?
5. **Quiz templates** - Should teachers be able to save/reuse quiz configurations?

---

## Summary

| Component | Package Name | Domain Example | Purpose |
|-----------|--------------|----------------|---------|
| Dashboard Frontend | `@mcqs/dashboard` | `dashboard.acme.com` | Teacher quiz management |
| Exam Frontend | `@mcqs/exam` | `exam.acme.com` | Student test-taking |
| Dashboard API | `@mcqs/api-dashboard` | `api-dashboard.acme.com` | Teacher API |
| Exam API | `@mcqs/api-exam` | `api-exam.acme.com` | Student API |
| Shared UI | `@mcqs/ui` | - | Reusable components |
| Shared Auth | `@mcqs/auth` | - | Google OAuth logic |
| Shared Types | `@mcqs/shared` | - | Types, schemas |
| Database | `@mcqs/db` | - | Migrations |
