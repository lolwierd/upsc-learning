# Per-Subject Current Affairs Ratios

**Validated by Gemini 3 Pro** classification of 900 UPSC GS1 PYQs (2017-2025 only).
Using post-2016 data because UPSC has trended more CA-heavy in recent years.

The direct:derived split within total CA is **37.5% : 62.5%** (preserving the original 15:25 internal ratio).

## Exact Ratios

| Subject        | Total CA | Direct CA | Derived Static | Pure Static | Gemini CA% | SD   | n   |
|----------------|----------|-----------|----------------|-------------|------------|------|-----|
| History        | 17.0%    | 6.375%    | 10.625%        | 83.0%       | 16.8%      | 14.9 | 125 |
| Art & Culture  | 23.0%    | 8.625%    | 14.375%        | 77.0%       | 23.1%      | 29.3 | 26  |
| Geography      | 44.0%    | 16.5%     | 27.5%          | 56.0%       | 44.4%      | 15.5 | 108 |
| Polity         | 49.0%    | 18.375%   | 30.625%        | 51.0%       | 49.3%      | 19.9 | 152 |
| Environment    | 63.0%    | 23.625%   | 39.375%        | 37.0%       | 62.9%      | 10.4 | 140 |
| Economy        | 71.0%    | 26.625%   | 44.375%        | 29.0%       | 71.1%      | 15.3 | 180 |
| Science & Tech | 80.0%    | 30.0%     | 50.0%          | 20.0%       | 80.4%      | 10.4 | 112 |

**Fallback** (unknown subject): Total CA = 45%, Direct = 16.9%, Derived = 28.1%, Pure = 55%

## Rounded Percentages (As Used in Prompts)

After `Math.round()`, these are the integer percentages the LLM sees:

| Subject        | Direct CA | Derived Static | Pure Static |
|----------------|-----------|----------------|-------------|
| History        | 6%        | 11%            | 83%         |
| Art & Culture  | 9%        | 14%            | 77%         |
| Geography      | 17%       | 28%            | 55%         |
| Polity         | 18%       | 31%            | 51%         |
| Environment    | 24%       | 39%            | 37%         |
| Economy        | 27%       | 44%            | 29%         |
| Science & Tech | 30%       | 50%            | 20%         |

## Expected Question Counts (10-question quiz)

| Subject        | Direct CA | Derived Static | Pure Static |
|----------------|-----------|----------------|-------------|
| History        | 1         | 1              | 8           |
| Art & Culture  | 1         | 1              | 8           |
| Geography      | 2         | 3              | 5           |
| Polity         | 2         | 3              | 5           |
| Environment    | 2         | 4              | 4           |
| Economy        | 3         | 4              | 3           |
| Science & Tech | 3         | 5              | 2           |

## Expected Question Counts (40-question quiz)

| Subject        | Direct CA | Derived Static | Pure Static |
|----------------|-----------|----------------|-------------|
| History        | 3         | 4              | 33          |
| Art & Culture  | 3         | 6              | 31          |
| Geography      | 7         | 11             | 22          |
| Polity         | 7         | 12             | 21          |
| Environment    | 9         | 16             | 15          |
| Economy        | 11        | 18             | 11          |
| Science & Tech | 12        | 20             | 8           |

## Year-by-Year CA% by Subject (2017-2025)

```
Subject            17   18   19   20   21   22   23   24   25   AVG
history            0%   7%   0%  17%  50%  19%  15%   0%  20%    14%
art_culture        0%  14%   0%   0%  67%   -    -   67%  50%    28%
geography         43%  50%  57%  70%  27%  69%  44%  25%  36%    47%
polity            27%  73%  75%  25%  37%  73%  44%  44%  73%    52%
environment       47%  69%  80%  69%  50%  65%  57%  56%  73%    63%
economy           95%  71%  69%  59%  53%  95%  67%  76%  50%    71%
science           89%  83%  83%  86%  62%  87%  83%  60%  87%    80%
```

## Validation Methodology

- **Tool**: Gemini 3 Pro Preview via Vertex AI
- **Dataset**: 1300 GS1 PYQs classified, 900 used (2017-2025)
- **Process**: Questions sent in batches of 25 with structured JSON output
- **Classification**: Binary (static vs ca-linked) with confidence level and rationale
- **Results file**: `scripts/ca-validation-results.json`
- **Analysis script**: `scripts/analyze-gemini-results.mjs`

## Key Findings

- **Science is overwhelmingly CA-driven** (80%) — 4 out of 5 questions are triggered by current events
- **Economy** follows closely (71%) — budget, trade, RBI policy dominate
- **Environment** at 63% — climate summits, conservation news, species discoveries
- **Polity** is nearly 50/50 — half static constitutional knowledge, half scheme/judgment-driven
- **History** remains the most static (17% CA) but not immune — heritage policies, archaeological discoveries
- **Art & Culture** has very high volatility (SD=29.3) with only 26 questions — treat with caution
- UPSC has clearly trended more CA-heavy post-2016 compared to 2013-2016

## Notes

- **SD** = Standard Deviation across years. Higher = more volatile year-to-year.
- **n** = total questions in that subject across 2017-2025.
- Art & Culture has low n (26) and very high SD — the 23% ratio is less reliable than others.
- The 37.5/62.5 direct:derived split is carried forward from the original system design.
