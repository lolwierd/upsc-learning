import { cn } from "@/lib/utils";
import type { QuestionSubject } from "@mcqs/shared";

interface SubjectBadgeProps {
  subject: QuestionSubject;
  className?: string;
}

const SUBJECT_CONFIG: Record<QuestionSubject, { label: string; className: string }> = {
  polity: { label: "Polity", className: "bg-indigo-100 text-indigo-800" },
  economy: { label: "Economy", className: "bg-emerald-100 text-emerald-800" },
  environment: { label: "Environment", className: "bg-green-100 text-green-800" },
  geography: { label: "Geography", className: "bg-amber-100 text-amber-800" },
  history: { label: "History", className: "bg-orange-100 text-orange-800" },
  science: { label: "Science", className: "bg-cyan-100 text-cyan-800" },
  culture: { label: "Culture", className: "bg-pink-100 text-pink-800" },
};

export function SubjectBadge({ subject, className }: SubjectBadgeProps) {
  const config = SUBJECT_CONFIG[subject] || { label: subject, className: "bg-gray-100 text-gray-800" };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs rounded-full",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
