Add a copy button for each test the aspirant can use to copy the question and its options to clipboard to ask to chatgpt thanks.

prefer themes -> not only use themes.
add web search for questions. 
try to intertwine questions with current affairs.
check pyqs for information thanks.
check current news and all. use thematic areas.


default 100% in hard difficulty.

think about removing question style

multiple eras too.

current affairs -> after answer or after question -> relevance of the question in bracket i.e. referance.

eras -> focuss too much on the style of eras... change prompt to say its dominant and have it generate other styles too thanks

## Dedupe Improvements (Post plan.md)

### 1. Exclude rejected duplicate topics from feedback loop
Currently `buildExcludeTopics()` only collects topics from *accepted* questions (`finalQuestions`). If the model keeps generating a duplicate that gets rejected by dedupe, that topic never enters the exclusion list — so the model keeps trying it. Fix: also collect topic summaries from questions rejected due to `intraConcept`/`fingerprint` duplication and add them to the exclusion list (can cap separately to avoid prompt bloat).

### 2. Fix search query exclusion cap direction
`uniqueQueries.slice(0, 20)` keeps the *earliest* queries, not the most recent. After many retries, the queries the model is *currently* repeating won't make the cutoff because they were appended later. Fix: change to `.slice(-20)` to keep the most recent queries.

### 3. Add `topicTag` to structured output schema
Instead of regex-scraping question text via `extractTopicSummary()`, add a `topicTag` (and optionally `subtopicTag`) field to `GENERATED_QUESTION_ARRAY_SCHEMA`. The model declares its topic explicitly, which is far more reliable for dedupe and exclusion list building. Then use model-declared topics for both deduplication and the excluded-topics feedback loop.