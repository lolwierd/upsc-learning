# Per-Subject Current Affairs Ratios

Calibrated from UPSC GS1 PYQ analysis across 2013-2025 (1300 questions).

The direct:derived split within total CA is **37.5% : 62.5%** (preserving the original 15:25 internal ratio).

## Exact Ratios

| Subject        | Total CA | Direct CA | Derived Static | Pure Static | Source (Avg CA%) | SD   |
|----------------|----------|-----------|----------------|-------------|------------------|------|
| History        | 6.0%     | 2.25%     | 3.75%          | 94.0%       | 6%               | 8.3  |
| Geography      | 14.0%    | 5.25%     | 8.75%          | 86.0%       | 14%              | 5.7  |
| Art & Culture  | 19.0%    | 7.125%    | 11.875%        | 81.0%       | 19%              | 16.4 |
| Science & Tech | 32.0%    | 12.0%     | 20.0%          | 68.0%       | 32%              | 5.9  |
| Polity         | 32.0%    | 12.0%     | 20.0%          | 68.0%       | 32%              | 9.8  |
| Economy        | 39.0%    | 14.625%   | 24.375%        | 61.0%       | 39%              | 15.5 |
| Environment    | 42.0%    | 15.75%    | 26.25%         | 58.0%       | 42%              | 11.4 |

**Fallback** (unknown subject): Total CA = 40%, Direct = 15%, Derived = 25%, Pure = 60%

## Rounded Percentages (As Used in Prompts)

After `Math.round()`, these are the integer percentages the LLM sees:

| Subject        | Direct CA | Derived Static | Pure Static |
|----------------|-----------|----------------|-------------|
| History        | 2%        | 4%             | 94%         |
| Geography      | 5%        | 9%             | 86%         |
| Art & Culture  | 7%        | 12%            | 81%         |
| Science & Tech | 12%       | 20%            | 68%         |
| Polity         | 12%       | 20%            | 68%         |
| Economy        | 15%       | 24%            | 61%         |
| Environment    | 16%       | 26%            | 58%         |

## Expected Question Counts (10-question quiz)

| Subject        | Direct CA | Derived Static | Pure Static |
|----------------|-----------|----------------|-------------|
| History        | 0         | 0              | 10          |
| Geography      | 1         | 1              | 8           |
| Art & Culture  | 1         | 1              | 8           |
| Science & Tech | 1         | 2              | 7           |
| Polity         | 1         | 2              | 7           |
| Economy        | 1         | 2              | 7           |
| Environment    | 2         | 3              | 5           |

## Expected Question Counts (40-question quiz)

Counts use exact floating-point ratios with `Math.round()`, then `psCount = total - dcCount - dsCount`.

| Subject        | Direct CA | Derived Static | Pure Static |
|----------------|-----------|----------------|-------------|
| History        | 1         | 2              | 37          |
| Geography      | 2         | 4              | 34          |
| Art & Culture  | 3         | 5              | 32          |
| Science & Tech | 5         | 8              | 27          |
| Polity         | 5         | 8              | 27          |
| Economy        | 6         | 10             | 24          |
| Environment    | 6         | 11             | 23          |

## Notes

- **SD** = Standard Deviation across 13 years. Lower = more stable/predictable.
- History is the most static-heavy subject (6% CA, very stable SD=8.3).
- Art & Culture has the highest volatility (SD=16.4) — swings 0-44% CA year to year.
- Environment is the most CA-heavy subject (42%) — climate, conservation topics dominate.
- The PYQ data is binary (static vs CA-linked); it doesn't distinguish direct-CA from derived-static. The 37.5/62.5 split is carried forward from the original system design.
