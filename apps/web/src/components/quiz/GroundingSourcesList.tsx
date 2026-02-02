import type { GroundingSource } from "@mcqs/shared";

interface GroundingSourcesListProps {
  sources?: GroundingSource[];
  explanation?: string; // Parse sources from explanation text if provided
}

// Parse "Sources: https://..." from explanation text
function parseSourcesFromExplanation(explanation: string): GroundingSource[] {
  // Match "Sources:" followed by URLs (handles multiple URLs separated by commas or spaces)
  const sourcesMatch = explanation.match(/Sources?:\s*(.+?)(?:\n|$)/i);
  if (!sourcesMatch) return [];

  const sourcesText = sourcesMatch[1];
  // Extract all URLs from the sources text
  const urlRegex = /https?:\/\/[^\s,]+/g;
  const urls = sourcesText.match(urlRegex) || [];

  return urls.map((uri) => {
    // Extract domain for display
    try {
      const url = new URL(uri);
      return {
        uri,
        domain: url.hostname.replace(/^www\./, ""),
      };
    } catch {
      return { uri };
    }
  });
}

export function GroundingSourcesList({ sources, explanation }: GroundingSourcesListProps) {
  // Parse from explanation if no sources provided directly
  const displaySources = sources?.length
    ? sources
    : explanation
      ? parseSourcesFromExplanation(explanation)
      : [];

  if (displaySources.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
      <p className="text-xs font-medium text-blue-800 mb-1">
        📎 Verified Sources
      </p>
      <ul className="space-y-1">
        {displaySources.map((source, idx) => (
          <li key={idx}>
            <a
              href={source.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1"
            >
              <span className="text-blue-400">→</span>
              <span className="truncate max-w-xs">
                {source.title || source.domain || source.uri}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
