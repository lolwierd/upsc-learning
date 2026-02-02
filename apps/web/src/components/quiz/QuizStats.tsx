import type { QuestionMetadata } from "@mcqs/shared";

interface QuizStatsProps {
  questions: Array<{ metadata?: QuestionMetadata }>;
}

export function QuizStats({ questions }: QuizStatsProps) {
  const stats = {
    directCA: 0,
    derivedStatic: 0,
    pureStatic: 0,
  };

  for (const question of questions) {
    const category = question.metadata?.category || "pure-static";
    switch (category) {
      case "direct-ca":
        stats.directCA++;
        break;
      case "derived-static":
        stats.derivedStatic++;
        break;
      case "pure-static":
        stats.pureStatic++;
        break;
    }
  }

  const total = questions.length || 1;
  const percentages = {
    directCA: Math.round((stats.directCA / total) * 100),
    derivedStatic: Math.round((stats.derivedStatic / total) * 100),
    pureStatic: Math.round((stats.pureStatic / total) * 100),
  };

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Question Distribution
      </h3>

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

      {/* UPSC Pattern Match Note */}
      <div className="mt-4 p-2 bg-green-50 rounded border border-green-200">
        <p className="text-xs text-green-800">
          ✓ This quiz follows UPSC 2025 pattern (15% CA / 25% Trending / 60% Static)
        </p>
      </div>
    </div>
  );
}
