import { cn } from "@/lib/utils";
import type { QuestionCategory } from "@mcqs/shared";

interface CategoryBadgeProps {
  category: QuestionCategory;
  className?: string;
}

const CATEGORY_CONFIG: Record<QuestionCategory, { label: string; emoji: string; className: string }> = {
  "direct-ca": {
    label: "Current Affairs",
    emoji: "📰",
    className: "bg-blue-100 text-blue-800 border-blue-300",
  },
  "derived-static": {
    label: "Trending Topic",
    emoji: "📊",
    className: "bg-purple-100 text-purple-800 border-purple-300",
  },
  "pure-static": {
    label: "Static",
    emoji: "📚",
    className: "bg-gray-100 text-gray-800 border-gray-300",
  },
};

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG["pure-static"];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border",
        config.className,
        className
      )}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}
