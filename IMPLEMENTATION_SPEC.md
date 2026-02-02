# Question Metadata & Grounding Integration - Implementation Spec

## Overview

Enhance the UPSC MCQ generation system to include comprehensive metadata for each question, automatically populated from Gemini's grounding chunks. This will enable validation, analytics, and better user experience.

## Context

We recently updated the prompts to follow UPSC's actual 3-tier pattern:
- **15% Direct CA**: Questions explicitly mentioning recent events (2025-2026) with [Relevance] tags and Sources
- **25% Derived Static**: Questions on trending topics but framed purely from textbooks (NO current affairs visible)
- **60% Pure Static**: Traditional textbook questions with no current affairs influence

**Validation across UPSC 2023-2025 papers confirms this pattern is consistent.**

## Current State

### Existing Question Schema (`packages/shared/src/types.ts`)
```typescript
interface Question {
  questionText: string;
  questionType: 'standard' | 'statement' | 'match' | 'assertion';
  options: string[];
  correctOption: number;
  explanation: string;
}
```

### Gemini Response Structure (from dumps)
```json
{
  "candidates": [...],
  "groundingMetadata": {
    "groundingChunks": [
      {
        "web": {
          "uri": "https://pib.gov.in/...",
          "title": "pib.gov.in",
          "domain": "pib.gov.in"
        }
      }
    ],
    "groundingSupports": [...],
    "retrievalMetadata": {}
  }
}
```

## Desired State

### Enhanced Question Schema

```typescript
interface QuestionMetadata {
  // Core categorization (REQUIRED)
  category: 'direct-ca' | 'derived-static' | 'pure-static';
  subject: 'polity' | 'economy' | 'environment' | 'geography' | 'history' | 'science' | 'culture';

  // Auto-populated from Gemini grounding (for Direct CA questions)
  groundingSources?: GroundingSource[];

  // Auto-inferred validation flags
  hasGrounding: boolean;
  hasRelevanceTag: boolean;
  hasSources: boolean;

  // Optional enrichment
  theme?: string;
  derivedFromTopic?: string; // For derived-static: what news triggered this
}

interface GroundingSource {
  uri: string;
  title?: string;
  domain?: string;
}

interface QuestionWithMetadata extends Question {
  metadata: QuestionMetadata;
}
```

### Updated Prompt Output Format

The prompt should request this JSON structure:

```json
[
  {
    "questionText": "Question text...",
    "questionType": "standard",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctOption": 0,
    "explanation": "Explanation with [Relevance: ...] and Sources: ... for Direct CA",
    "metadata": {
      "category": "direct-ca",
      "subject": "polity",
      "derivedFromTopic": null
    }
  },
  {
    "questionText": "Question text...",
    "questionType": "statement",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctOption": 1,
    "explanation": "Pure textbook explanation with NO [Relevance]",
    "metadata": {
      "category": "derived-static",
      "subject": "economy",
      "derivedFromTopic": "SEBI F&O warnings in news Dec 2025"
    }
  }
]
```

## Implementation Tasks

### 1. Update Shared Types (`packages/shared/src/types.ts`)

Add the new interfaces:
```typescript
export interface GroundingSource {
  uri: string;
  title?: string;
  domain?: string;
}

export interface QuestionMetadata {
  category: 'direct-ca' | 'derived-static' | 'pure-static';
  subject: 'polity' | 'economy' | 'environment' | 'geography' | 'history' | 'science' | 'culture';
  groundingSources?: GroundingSource[];
  hasGrounding: boolean;
  hasRelevanceTag: boolean;
  hasSources: boolean;
  theme?: string;
  derivedFromTopic?: string;
}

export interface QuestionWithMetadata extends Question {
  metadata: QuestionMetadata;
}
```

### 2. Update Zod Schemas (`packages/shared/src/schemas.ts`)

Add validation schemas:
```typescript
import { z } from 'zod';

export const groundingSourceSchema = z.object({
  uri: z.string().url(),
  title: z.string().optional(),
  domain: z.string().optional(),
});

export const questionMetadataSchema = z.object({
  category: z.enum(['direct-ca', 'derived-static', 'pure-static']),
  subject: z.enum(['polity', 'economy', 'environment', 'geography', 'history', 'science', 'culture']),
  groundingSources: z.array(groundingSourceSchema).optional(),
  hasGrounding: z.boolean(),
  hasRelevanceTag: z.boolean(),
  hasSources: z.boolean(),
  theme: z.string().optional(),
  derivedFromTopic: z.string().optional(),
});

export const questionWithMetadataSchema = questionSchema.extend({
  metadata: questionMetadataSchema,
});
```

### 3. Update Prompt Output Format (`apps/worker/src/prompts/index.ts`)

Update the OUTPUT FORMAT section (around line 290-302) to include metadata:

```typescript
OUTPUT FORMAT

Generate EXACTLY ${totalCount} questions in valid JSON array format:

[
  {
    "questionText": "Question with proper UPSC phrasing...",
    "questionType": "standard|statement|match|assertion",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctOption": 0,
    "explanation": "Clear explanation mentioning subject area, static concept, and sources if current affairs...",
    "metadata": {
      "category": "direct-ca|derived-static|pure-static",
      "subject": "polity|economy|environment|geography|history|science|culture",
      "derivedFromTopic": "Optional: For derived-static, what recent news/trend triggered this topic selection"
    }
  },
  ...
]

METADATA REQUIREMENTS:
- category: MUST match the question type (direct-ca has [Relevance], derived-static does not)
- subject: Primary subject being tested
- derivedFromTopic: Only for derived-static questions - briefly note the news event that made this topic relevant
```

### 4. Extract Grounding Sources (`apps/worker/src/services/llm.ts` or quiz handler)

Add utility functions:

```typescript
interface GeminiGroundingMetadata {
  groundingChunks?: Array<{
    web?: {
      uri: string;
      title?: string;
      domain?: string;
    };
  }>;
}

function extractGroundingSources(
  groundingMetadata: GeminiGroundingMetadata | undefined
): GroundingSource[] {
  if (!groundingMetadata?.groundingChunks) {
    return [];
  }

  return groundingMetadata.groundingChunks
    .filter(chunk => chunk.web?.uri)
    .map(chunk => ({
      uri: chunk.web!.uri,
      title: chunk.web?.title,
      domain: chunk.web?.domain,
    }));
}
```

### 5. Enrich Questions with Grounding & Auto-Validation

After parsing Gemini's JSON response, enrich each question:

```typescript
function enrichQuestionWithGrounding(
  question: any,
  allGroundingSources: GroundingSource[]
): QuestionWithMetadata {

  const explanation = question.explanation || '';

  // Auto-detect validation flags
  const hasRelevanceTag = explanation.includes('[Relevance:');
  const hasSources = explanation.includes('Sources:');

  // Validate category matches flags
  const category = question.metadata?.category || 'pure-static';

  if (category === 'direct-ca' && (!hasRelevanceTag || !hasSources)) {
    console.warn(`Question marked as direct-ca but missing [Relevance] or Sources`);
  }

  if ((category === 'derived-static' || category === 'pure-static') && (hasRelevanceTag || hasSources)) {
    console.warn(`Question marked as ${category} but has [Relevance] or Sources - likely miscategorized`);
  }

  return {
    ...question,
    metadata: {
      ...question.metadata,
      groundingSources: category === 'direct-ca' ? allGroundingSources : undefined,
      hasGrounding: allGroundingSources.length > 0,
      hasRelevanceTag,
      hasSources,
    }
  };
}
```

### 6. Add Distribution Validation

Create a validation utility to check the 15/25/60 split:

```typescript
interface ValidationResult {
  valid: boolean;
  issues: string[];
  stats: {
    'direct-ca': number;
    'derived-static': number;
    'pure-static': number;
    total: number;
    withGrounding: number;
    withRelevance: number;
  };
}

function validateQuestionDistribution(
  questions: QuestionWithMetadata[]
): ValidationResult {

  const stats = questions.reduce((acc, q) => {
    acc[q.metadata.category]++;
    if (q.metadata.hasGrounding) acc.withGrounding++;
    if (q.metadata.hasRelevanceTag) acc.withRelevance++;
    return acc;
  }, {
    'direct-ca': 0,
    'derived-static': 0,
    'pure-static': 0,
    total: questions.length,
    withGrounding: 0,
    withRelevance: 0,
  });

  const issues: string[] = [];
  const total = questions.length;

  // Check 15% Direct CA (tolerance: ±5%)
  const directCAPct = (stats['direct-ca'] / total) * 100;
  if (Math.abs(directCAPct - 15) > 5) {
    issues.push(
      `Direct CA ratio: ${directCAPct.toFixed(1)}% (expected 15% ± 5%)`
    );
  }

  // Check 25% Derived Static (tolerance: ±5%)
  const derivedStaticPct = (stats['derived-static'] / total) * 100;
  if (Math.abs(derivedStaticPct - 25) > 5) {
    issues.push(
      `Derived Static ratio: ${derivedStaticPct.toFixed(1)}% (expected 25% ± 5%)`
    );
  }

  // Check 60% Pure Static (tolerance: ±5%)
  const pureStaticPct = (stats['pure-static'] / total) * 100;
  if (Math.abs(pureStaticPct - 60) > 5) {
    issues.push(
      `Pure Static ratio: ${pureStaticPct.toFixed(1)}% (expected 60% ± 5%)`
    );
  }

  // Validate Direct CA questions have grounding
  const directCAQuestions = questions.filter(q => q.metadata.category === 'direct-ca');
  const directCAWithoutGrounding = directCAQuestions.filter(
    q => !q.metadata.hasRelevanceTag || !q.metadata.hasSources
  );

  if (directCAWithoutGrounding.length > 0) {
    issues.push(
      `${directCAWithoutGrounding.length} Direct CA questions missing [Relevance] or Sources`
    );
  }

  // Validate Derived/Pure Static don't have [Relevance]
  const nonDirectCAQuestions = questions.filter(q => q.metadata.category !== 'direct-ca');
  const nonDirectCAWithRelevance = nonDirectCAQuestions.filter(
    q => q.metadata.hasRelevanceTag || q.metadata.hasSources
  );

  if (nonDirectCAWithRelevance.length > 0) {
    issues.push(
      `${nonDirectCAWithRelevance.length} Derived/Pure Static questions have [Relevance]/Sources (should not)`
    );
  }

  return {
    valid: issues.length === 0,
    issues,
    stats,
  };
}
```

### 7. Integration in Quiz Generation Handler

Update the quiz generation flow:

```typescript
// In apps/worker/src/routes/quiz.ts or equivalent

async function generateQuiz(params: QuizParams) {
  // 1. Generate questions with Gemini
  const geminiResponse = await generateWithGemini(prompt);

  // 2. Extract grounding sources
  const groundingSources = extractGroundingSources(
    geminiResponse.groundingMetadata
  );

  // 3. Parse questions from response
  const rawQuestions = JSON.parse(geminiResponse.text);

  // 4. Enrich with grounding and validate
  const enrichedQuestions = rawQuestions.map((q: any) =>
    enrichQuestionWithGrounding(q, groundingSources)
  );

  // 5. Validate distribution
  const validation = validateQuestionDistribution(enrichedQuestions);

  if (!validation.valid) {
    console.warn('Question distribution issues:', validation.issues);
    // Optionally: log to monitoring, regenerate, or alert
  }

  console.log('Question stats:', validation.stats);

  // 6. Save to database with metadata
  return enrichedQuestions;
}
```

## Database Schema Updates

If questions are stored in D1, update the schema to store metadata:

```sql
-- Add metadata columns to questions table
ALTER TABLE questions ADD COLUMN category TEXT;
ALTER TABLE questions ADD COLUMN subject TEXT;
ALTER TABLE questions ADD COLUMN derived_from_topic TEXT;
ALTER TABLE questions ADD COLUMN grounding_sources TEXT; -- JSON array
ALTER TABLE questions ADD COLUMN has_grounding INTEGER DEFAULT 0;
ALTER TABLE questions ADD COLUMN has_relevance_tag INTEGER DEFAULT 0;
ALTER TABLE questions ADD COLUMN has_sources INTEGER DEFAULT 0;

-- Add indexes for analytics
CREATE INDEX idx_questions_category ON questions(category);
CREATE INDEX idx_questions_subject ON questions(subject);
```

## Benefits

1. **Validation**: Automatically verify 15/25/60 split is maintained
2. **Analytics**: Track generation patterns, subject distribution, grounding usage
3. **Debugging**: Quickly identify miscategorized questions
4. **User Features**: Filter questions by category, subject, or grounding status
5. **Transparency**: Show users exact sources for Direct CA questions
6. **Quality Control**: Ensure Direct CA questions actually use web search

## Testing Checklist

After implementation:

- [ ] Generate a 20-question quiz and verify distribution is close to 3/5/12
- [ ] Check that Direct CA questions (15%) have grounding sources populated
- [ ] Verify Derived Static questions (25%) have derivedFromTopic but NO [Relevance]
- [ ] Confirm Pure Static questions (60%) have neither grounding nor [Relevance]
- [ ] Test validation function catches miscategorized questions
- [ ] Verify database correctly stores and retrieves metadata

## Example Output

After implementation, a quiz response should look like:

```json
{
  "quizId": "xyz",
  "questions": [
    {
      "questionText": "With reference to the Union Budget 2025-26...",
      "questionType": "statement",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctOption": 1,
      "explanation": "... [Relevance: Union Budget 2025-26, Feb 2026]\nSources: https://pib.gov.in/...",
      "metadata": {
        "category": "direct-ca",
        "subject": "economy",
        "groundingSources": [
          {
            "uri": "https://pib.gov.in/...",
            "title": "pib.gov.in",
            "domain": "pib.gov.in"
          }
        ],
        "hasGrounding": true,
        "hasRelevanceTag": true,
        "hasSources": true,
        "derivedFromTopic": null
      }
    },
    {
      "questionText": "Consider the following statements about the Governor's powers...",
      "questionType": "statement",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctOption": 2,
      "explanation": "Pure textbook explanation of Article 200 powers...",
      "metadata": {
        "category": "derived-static",
        "subject": "polity",
        "groundingSources": undefined,
        "hasGrounding": false,
        "hasRelevanceTag": false,
        "hasSources": false,
        "derivedFromTopic": "Governor-state bill assent conflicts in Tamil Nadu/Kerala, Dec 2025"
      }
    }
  ],
  "validation": {
    "valid": true,
    "stats": {
      "direct-ca": 3,
      "derived-static": 5,
      "pure-static": 12,
      "total": 20
    }
  }
}
```

## Frontend UI Updates (`apps/web`)

### 1. **Question Card Component** - Display Category Badge

Update the question display to show category badges:

```tsx
// apps/web/components/QuestionCard.tsx

interface QuestionCardProps {
  question: QuestionWithMetadata;
  // ... other props
}

function getCategoryBadge(category: string) {
  const badges = {
    'direct-ca': {
      label: 'Current Affairs',
      color: 'bg-blue-100 text-blue-800 border-blue-300',
      icon: '📰'
    },
    'derived-static': {
      label: 'Trending Topic',
      color: 'bg-purple-100 text-purple-800 border-purple-300',
      icon: '📊'
    },
    'pure-static': {
      label: 'Static',
      color: 'bg-gray-100 text-gray-800 border-gray-300',
      icon: '📚'
    }
  };
  return badges[category] || badges['pure-static'];
}

export function QuestionCard({ question }: QuestionCardProps) {
  const badge = getCategoryBadge(question.metadata.category);

  return (
    <div className="question-card">
      {/* Category Badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs px-2 py-1 rounded-full border ${badge.color}`}>
          {badge.icon} {badge.label}
        </span>

        {/* Subject Badge */}
        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
          {question.metadata.subject}
        </span>

        {/* Grounding Indicator (only for Direct CA) */}
        {question.metadata.hasGrounding && (
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
            ✓ Verified Sources
          </span>
        )}
      </div>

      {/* Question Text */}
      <div className="question-text mb-4">
        {question.questionText}
      </div>

      {/* Options */}
      {/* ... */}
    </div>
  );
}
```

### 2. **Explanation Panel** - Show Grounding Sources

Display grounding sources at the bottom of explanations:

```tsx
// apps/web/components/ExplanationPanel.tsx

interface GroundingSourcesProps {
  sources: GroundingSource[];
}

function GroundingSourcesList({ sources }: GroundingSourcesProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
      <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
        <svg className="w-4 h-4" /* source icon */ />
        Verified Sources
      </h4>
      <ul className="space-y-2">
        {sources.map((source, idx) => (
          <li key={idx}>
            <a
              href={source.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2"
            >
              <span className="text-gray-400">🔗</span>
              <span className="flex-1">{source.title || source.domain || 'View Source'}</span>
              <svg className="w-3 h-3" /* external link icon */ />
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-600 mt-2">
        These sources were used to verify the current affairs content in this question.
      </p>
    </div>
  );
}

export function ExplanationPanel({ question, showAnswer }: Props) {
  return (
    <div className="explanation-panel">
      {/* Standard explanation content */}
      <div className="prose prose-sm">
        {parseExplanation(question.explanation)}
      </div>

      {/* Grounding Sources (only for Direct CA questions) */}
      {question.metadata.category === 'direct-ca' && (
        <GroundingSourcesList sources={question.metadata.groundingSources || []} />
      )}

      {/* Derived From Topic (only for Derived Static) */}
      {question.metadata.category === 'derived-static' && question.metadata.derivedFromTopic && (
        <div className="mt-4 p-3 bg-purple-50 rounded border border-purple-200">
          <p className="text-xs text-purple-800">
            <span className="font-semibold">📊 Trending Topic:</span> This question covers a topic
            currently in the news: {question.metadata.derivedFromTopic}
          </p>
        </div>
      )}
    </div>
  );
}
```

### 3. **Quiz Stats Dashboard**

Add a stats component to show distribution:

```tsx
// apps/web/components/QuizStats.tsx

interface QuizStatsProps {
  questions: QuestionWithMetadata[];
}

export function QuizStats({ questions }: QuizStatsProps) {
  const stats = {
    total: questions.length,
    directCA: questions.filter(q => q.metadata.category === 'direct-ca').length,
    derivedStatic: questions.filter(q => q.metadata.category === 'derived-static').length,
    pureStatic: questions.filter(q => q.metadata.category === 'pure-static').length,
  };

  const percentages = {
    directCA: ((stats.directCA / stats.total) * 100).toFixed(0),
    derivedStatic: ((stats.derivedStatic / stats.total) * 100).toFixed(0),
    pureStatic: ((stats.pureStatic / stats.total) * 100).toFixed(0),
  };

  return (
    <div className="quiz-stats p-4 bg-white rounded-lg shadow">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Question Distribution</h3>

      {/* Progress Bars */}
      <div className="space-y-3">
        {/* Direct CA */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">📰 Current Affairs</span>
            <span className="text-gray-900 font-medium">
              {stats.directCA} ({percentages.directCA}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${percentages.directCA}%` }}
            />
          </div>
        </div>

        {/* Derived Static */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">📊 Trending Topics</span>
            <span className="text-gray-900 font-medium">
              {stats.derivedStatic} ({percentages.derivedStatic}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all"
              style={{ width: `${percentages.derivedStatic}%` }}
            />
          </div>
        </div>

        {/* Pure Static */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">📚 Static/Textbook</span>
            <span className="text-gray-900 font-medium">
              {stats.pureStatic} ({percentages.pureStatic}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gray-500 h-2 rounded-full transition-all"
              style={{ width: `${percentages.pureStatic}%` }}
            />
          </div>
        </div>
      </div>

      {/* UPSC Pattern Match */}
      <div className="mt-4 p-3 bg-green-50 rounded border border-green-200">
        <p className="text-xs text-green-800">
          ✓ This quiz follows UPSC 2025 pattern (15% CA / 25% Trending / 60% Static)
        </p>
      </div>
    </div>
  );
}
```

### 4. **Filter by Category**

Add filtering options on quiz history or review pages:

```tsx
// apps/web/components/QuestionFilter.tsx

interface FilterProps {
  onFilterChange: (filters: FilterState) => void;
}

export function QuestionFilter({ onFilterChange }: FilterProps) {
  const [filters, setFilters] = useState({
    category: 'all',
    subject: 'all',
    hasGrounding: false,
  });

  return (
    <div className="filter-bar p-4 bg-gray-50 rounded-lg">
      <div className="grid grid-cols-3 gap-4">
        {/* Category Filter */}
        <div>
          <label className="text-xs font-medium text-gray-700">Category</label>
          <select
            className="mt-1 w-full text-sm rounded border-gray-300"
            value={filters.category}
            onChange={e => {
              const newFilters = { ...filters, category: e.target.value };
              setFilters(newFilters);
              onFilterChange(newFilters);
            }}
          >
            <option value="all">All Questions</option>
            <option value="direct-ca">📰 Current Affairs</option>
            <option value="derived-static">📊 Trending Topics</option>
            <option value="pure-static">📚 Static</option>
          </select>
        </div>

        {/* Subject Filter */}
        <div>
          <label className="text-xs font-medium text-gray-700">Subject</label>
          <select className="mt-1 w-full text-sm rounded border-gray-300">
            <option value="all">All Subjects</option>
            <option value="polity">Polity</option>
            <option value="economy">Economy</option>
            <option value="environment">Environment</option>
            <option value="geography">Geography</option>
            <option value="history">History</option>
            <option value="science">Science & Tech</option>
            <option value="culture">Art & Culture</option>
          </select>
        </div>

        {/* Grounding Filter */}
        <div className="flex items-end">
          <label className="flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              className="mr-2 rounded"
              checked={filters.hasGrounding}
              onChange={e => {
                const newFilters = { ...filters, hasGrounding: e.target.checked };
                setFilters(newFilters);
                onFilterChange(newFilters);
              }}
            />
            ✓ Verified Sources Only
          </label>
        </div>
      </div>
    </div>
  );
}
```

### 5. **Results Page Enhancement**

Show grounding details in quiz results:

```tsx
// apps/web/app/quiz/[id]/results/page.tsx

export default function ResultsPage({ params }: Props) {
  // ... existing code

  return (
    <div>
      {/* Stats Overview */}
      <QuizStats questions={quiz.questions} />

      {/* Question Review */}
      {quiz.questions.map((question, idx) => (
        <div key={idx} className="question-review mb-6">
          <QuestionCard
            question={question}
            userAnswer={attempt.answers[idx]}
            showCorrectAnswer
          />

          <ExplanationPanel
            question={question}
            showAnswer
          />
        </div>
      ))}
    </div>
  );
}
```

### 6. **Settings Page - Display Preferences**

Add user preferences for grounding display:

```tsx
// apps/web/app/settings/page.tsx

export default function SettingsPage() {
  const [preferences, setPreferences] = useState({
    showCategoryBadges: true,
    showGroundingSources: true,
    showDerivedFromTopic: true,
    showQuizStats: true,
  });

  return (
    <div className="settings-page">
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Question Display</h2>

        <div className="space-y-3">
          <label className="flex items-center text-sm">
            <input type="checkbox" className="mr-2"
              checked={preferences.showCategoryBadges}
              onChange={e => setPreferences({ ...preferences, showCategoryBadges: e.target.checked })}
            />
            Show category badges (Current Affairs, Trending, Static)
          </label>

          <label className="flex items-center text-sm">
            <input type="checkbox" className="mr-2"
              checked={preferences.showGroundingSources}
              onChange={e => setPreferences({ ...preferences, showGroundingSources: e.target.checked })}
            />
            Show grounding sources for Current Affairs questions
          </label>

          <label className="flex items-center text-sm">
            <input type="checkbox" className="mr-2"
              checked={preferences.showDerivedFromTopic}
              onChange={e => setPreferences({ ...preferences, showDerivedFromTopic: e.target.checked })}
            />
            Show "Trending Topic" context for derived questions
          </label>
        </div>
      </section>
    </div>
  );
}
```

## Frontend File Changes Summary

### New Components
- `apps/web/components/QuizStats.tsx` - Distribution visualization
- `apps/web/components/QuestionFilter.tsx` - Filter by category/subject
- `apps/web/components/GroundingSourcesList.tsx` - Display sources

### Modified Components
- `apps/web/components/QuestionCard.tsx` - Add category badges
- `apps/web/components/ExplanationPanel.tsx` - Show grounding sources
- `apps/web/app/quiz/[id]/results/page.tsx` - Enhanced results display
- `apps/web/app/settings/page.tsx` - Display preferences

### Styling Recommendations

Add to `apps/web/app/globals.css`:

```css
/* Category Badges */
.category-badge {
  @apply inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border;
}

.category-badge.direct-ca {
  @apply bg-blue-100 text-blue-800 border-blue-300;
}

.category-badge.derived-static {
  @apply bg-purple-100 text-purple-800 border-purple-300;
}

.category-badge.pure-static {
  @apply bg-gray-100 text-gray-800 border-gray-300;
}

/* Grounding Sources */
.grounding-source-link {
  @apply flex items-center gap-2 p-2 rounded hover:bg-blue-100 transition-colors;
}

.grounding-source-link:hover {
  @apply text-blue-700 underline;
}
```

## Priority

**High** - This enables critical validation and analytics capabilities while the prompting improvements are fresh.

## Estimated Complexity

**Medium-High** - Requires changes across multiple files (backend + frontend) but logic is straightforward.

---

**Implementation Notes:**
- Start with types/schemas, then prompt updates, then enrichment logic, then frontend
- Test each layer before moving to the next
- Consider backward compatibility if existing quizzes are in database
- Add logging at each step for debugging
- For frontend, start with QuizStats component first as a visual test
- Grounding sources display is the most visible user-facing feature
