import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Block =
  | { type: "p"; content: string }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: string }
  | { type: "code"; lang?: string; content: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "blockquote"; content: string }
  | { type: "hr" };

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeNewlines(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sanitizeUrl(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  // Disallow javascript:, data:, vbscript:, etc.
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

function stripTrailingUrlPunct(url: string): string {
  // Common punctuation that often trails URLs in prose.
  return url.replace(/[)\],.;:!?]+$/g, "");
}

function parseBlocks(src: string): Block[] {
  const lines = normalizeNewlines(src).split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    const content = para.join("\n").trimEnd();
    if (content) blocks.push({ type: "p", content });
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw;

    // Fenced code blocks: ```lang
    const fence = line.match(/^\s*```(\S*)\s*$/);
    if (fence) {
      flushPara();
      const lang = fence[1] ? fence[1] : undefined;
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? "")) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      // Consume closing fence if present.
      if (i < lines.length && /^\s*```\s*$/.test(lines[i] ?? "")) i += 1;
      blocks.push({ type: "code", lang, content: codeLines.join("\n") });
      continue;
    }

    // Horizontal rule.
    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushPara();
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // Headings: # .. ######
    const heading = line.match(/^\s*(#{1,6})\s+(.+)\s*$/);
    if (heading) {
      flushPara();
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: "heading", level, content: heading[2] });
      i += 1;
      continue;
    }

    // Blockquotes.
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const q: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i] ?? "")) {
        q.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "blockquote", content: q.join("\n") });
      continue;
    }

    // Lists.
    const ul = line.match(/^\s*[-*+]\s+(.+)\s*$/);
    if (ul) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const m = (lines[i] ?? "").match(/^\s*[-*+]\s+(.+)\s*$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.+)\s*$/);
    if (ol) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const m = (lines[i] ?? "").match(/^\s*\d+\.\s+(.+)\s*$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Blank line: paragraph boundary.
    if (/^\s*$/.test(line)) {
      flushPara();
      i += 1;
      continue;
    }

    para.push(line);
    i += 1;
  }

  flushPara();
  return blocks;
}

type InlinePattern = {
  kind: "link" | "url" | "strong" | "em";
  regex: RegExp;
};

const INLINE_PATTERNS: InlinePattern[] = [
  { kind: "link", regex: /\[([^\]]+)\]\(([^)\s]+)\)/ },
  { kind: "url", regex: /\bhttps?:\/\/[^\s<]+/ },
  { kind: "strong", regex: /\*\*([^*]+)\*\*/ },
  { kind: "strong", regex: /__([^_]+)__/ },
  { kind: "em", regex: /\*([^*]+)\*/ },
  { kind: "em", regex: /_([^_]+)_/ },
];

function renderInlines(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const pushText = (value: string) => {
    if (!value) return;
    out.push(value);
  };

  while (remaining) {
    let best:
      | {
          kind: InlinePattern["kind"];
          match: RegExpExecArray;
          index: number;
        }
      | undefined;

    for (const p of INLINE_PATTERNS) {
      const m = p.regex.exec(remaining);
      if (!m) continue;
      if (!best || m.index < best.index) best = { kind: p.kind, match: m, index: m.index };
      // Prefer earliest match; if tie, keep earlier pattern order.
      if (best.index === 0) break;
    }

    if (!best) {
      pushText(remaining);
      break;
    }

    if (best.index > 0) {
      pushText(remaining.slice(0, best.index));
    }

    const full = best.match[0] ?? "";

    if (best.kind === "link") {
      const label = best.match[1] ?? "";
      const hrefRaw = best.match[2] ?? "";
      const href = sanitizeUrl(hrefRaw);

      if (!href) {
        pushText(full);
      } else {
        out.push(
          <a
            key={`${keyPrefix}-a-${key++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {renderInlineWithBreaks(label, `${keyPrefix}-a-label-${key}`)}
          </a>
        );
      }
    } else if (best.kind === "url") {
      const rawUrl = best.match[0] ?? "";
      const clean = stripTrailingUrlPunct(rawUrl);
      const href = sanitizeUrl(clean);

      if (!href) {
        pushText(rawUrl);
      } else {
        out.push(
          <a
            key={`${keyPrefix}-url-${key++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 break-all"
          >
            {clean}
          </a>
        );
        // If we stripped punctuation, keep it as literal text.
        const trailing = rawUrl.slice(clean.length);
        if (trailing) pushText(trailing);
      }
    } else if (best.kind === "strong") {
      const inner = best.match[1] ?? "";
      out.push(
        <strong key={`${keyPrefix}-strong-${key++}`} className="font-semibold">
          {renderInlineWithBreaks(inner, `${keyPrefix}-strong-inner-${key}`)}
        </strong>
      );
    } else if (best.kind === "em") {
      const inner = best.match[1] ?? "";
      out.push(
        <em key={`${keyPrefix}-em-${key++}`} className="italic">
          {renderInlineWithBreaks(inner, `${keyPrefix}-em-inner-${key}`)}
        </em>
      );
    }

    remaining = remaining.slice(best.index + full.length);
  }

  return out;
}

function renderInlineWithBreaks(text: string, keyPrefix: string): ReactNode[] {
  // Preserve soft line breaks in places like options/explanations.
  const parts = normalizeNewlines(text).split("\n");
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) out.push(<br key={`${keyPrefix}-br-${i}`} />);
    out.push(...renderCodeSpans(parts[i] ?? "", `${keyPrefix}-line-${i}`));
  }
  return out;
}

function renderCodeSpans(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < text.length) {
    const start = text.indexOf("`", i);
    if (start === -1) {
      out.push(...renderInlines(text.slice(i), `${keyPrefix}-t-${key++}`));
      break;
    }

    if (start > i) {
      out.push(...renderInlines(text.slice(i, start), `${keyPrefix}-t-${key++}`));
    }

    const end = text.indexOf("`", start + 1);
    if (end === -1) {
      // Unclosed backtick: treat as literal.
      out.push("`");
      i = start + 1;
      continue;
    }

    const code = text.slice(start + 1, end);
    out.push(
      <code
        key={`${keyPrefix}-code-${key++}`}
        className="px-1 py-0.5 rounded bg-black/5 font-mono text-[0.9em]"
      >
        {code}
      </code>
    );
    i = end + 1;
  }

  return out;
}

function renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[] {
  return blocks.map((b, idx) => {
    const k = `${keyPrefix}-b-${idx}`;
    if (b.type === "hr") {
      return <hr key={k} className="border-black/10" />;
    }

    if (b.type === "heading") {
      const cls =
        b.level <= 2
          ? "text-base font-semibold"
          : b.level <= 4
            ? "text-sm font-semibold"
            : "text-sm font-semibold text-black/80";
      const Tag = (`h${b.level}` as const);
      return (
        <Tag key={k} className={cls}>
          {renderInlineWithBreaks(b.content, `${k}-h`)}
        </Tag>
      );
    }

    if (b.type === "code") {
      return (
        <pre
          key={k}
          className="rounded-lg border border-black/10 bg-slate-950 text-slate-100 p-3 overflow-x-auto text-xs leading-relaxed"
        >
          <code>{b.content}</code>
        </pre>
      );
    }

    if (b.type === "ul") {
      return (
        <ul key={k} className="list-disc pl-5 space-y-1">
          {b.items.map((it, j) => (
            <li key={`${k}-li-${j}`}>{renderInlineWithBreaks(it, `${k}-li-${j}`)}</li>
          ))}
        </ul>
      );
    }

    if (b.type === "ol") {
      return (
        <ol key={k} className="list-decimal pl-5 space-y-1">
          {b.items.map((it, j) => (
            <li key={`${k}-li-${j}`}>{renderInlineWithBreaks(it, `${k}-li-${j}`)}</li>
          ))}
        </ol>
      );
    }

    if (b.type === "blockquote") {
      const inner = parseBlocks(b.content);
      return (
        <blockquote key={k} className="border-l-2 border-black/15 pl-3 text-black/80">
          <div className="space-y-2">{renderBlocks(inner, `${k}-q`)}</div>
        </blockquote>
      );
    }

    // Paragraph
    return (
      <p key={k} className="leading-relaxed">
        {renderInlineWithBreaks(b.content, `${k}-p`)}
      </p>
    );
  });
}

export function Markdown({
  children,
  text,
  className,
  inline = false,
}: {
  children?: string | null;
  text?: string | null;
  className?: string;
  inline?: boolean;
}) {
  const raw = typeof text === "string" ? text : typeof children === "string" ? children : "";
  if (!raw) return null;
  const value = decodeHtmlEntities(raw);

  if (inline) {
    return <span className={cn(className)}>{renderInlineWithBreaks(value, "md-inline")}</span>;
  }

  const blocks = parseBlocks(value);
  return <div className={cn("space-y-2", className)}>{renderBlocks(blocks, "md")}</div>;
}

