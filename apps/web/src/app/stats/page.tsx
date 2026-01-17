"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getStats, getStatsTimeline, type TimelineDay } from "@/lib/api";
import type { UserStats } from "@mcqs/shared";
import { SUBJECT_LABELS, DIFFICULTY_LABELS } from "@mcqs/shared";

export default function StatsPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, timelineData] = await Promise.all([
          getStats(),
          getStatsTimeline(50),
        ]);
        setStats(statsData);
        setTimeline(timelineData.timeline);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading statistics...</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <p className="text-red-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!stats || stats.overall.totalAttempts === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <CardTitle className="mb-6">Statistics</CardTitle>
        <Card className="text-center py-12">
          <p className="text-gray-500 mb-4">
            No statistics yet. Complete your first quiz to see your performance.
          </p>
          <Link href="/quiz/new">
            <Button>Create Your First Quiz</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return "text-green-600";
    if (accuracy >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getBarColor = (accuracy: number) => {
    if (accuracy >= 80) return "bg-green-500";
    if (accuracy >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split("T")[0]) {
      return "Today";
    }
    if (dateStr === yesterday.toISOString().split("T")[0]) {
      return "Yesterday";
    }

    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <CardTitle className="mb-6">Statistics</CardTitle>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <p className="text-sm text-gray-500 mb-1">Total Quizzes</p>
          <p className="text-3xl font-bold text-gray-900">
            {stats.overall.totalAttempts}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Questions Answered</p>
          <p className="text-3xl font-bold text-gray-900">
            {stats.overall.totalQuestions}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Correct Answers</p>
          <p className="text-3xl font-bold text-green-600">
            {stats.overall.totalCorrect}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Overall Accuracy</p>
          <p
            className={cn(
              "text-3xl font-bold",
              getAccuracyColor(stats.overall.accuracy)
            )}
          >
            {stats.overall.accuracy}%
          </p>
        </Card>
      </div>

      {/* Subject-wise Stats */}
      <Card className="mb-8">
        <CardTitle className="mb-6">Performance by Subject</CardTitle>
        <div className="space-y-4">
          {stats.bySubject.map((subject) => (
            <div key={subject.subject}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">
                  {SUBJECT_LABELS[subject.subject as keyof typeof SUBJECT_LABELS]}
                </span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    {subject.correct}/{subject.total} correct
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      getAccuracyColor(subject.accuracy)
                    )}
                  >
                    {subject.accuracy}%
                  </span>
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    getBarColor(subject.accuracy)
                  )}
                  style={{ width: `${subject.accuracy}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {stats.bySubject.length === 0 && (
          <p className="text-gray-500 text-center py-4">
            No subject-specific data available yet.
          </p>
        )}
      </Card>

      {/* Timeline */}
      <Card>
        <CardTitle className="mb-6">Quiz Timeline</CardTitle>
        {timeline.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No completed quizzes yet.
          </p>
        ) : (
          <div className="space-y-6">
            {timeline.map((day) => {
              const dayAccuracy = Math.round((day.totalScore / day.totalQuestions) * 100);
              return (
                <div key={day.date}>
                  {/* Date Header */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">
                      {formatDate(day.date)}
                    </h3>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500">
                        {day.quizzes.length} quiz{day.quizzes.length !== 1 ? "zes" : ""}
                      </span>
                      <span className={cn("font-medium", getAccuracyColor(dayAccuracy))}>
                        {day.totalScore}/{day.totalQuestions} ({dayAccuracy}%)
                      </span>
                    </div>
                  </div>

                  {/* Quizzes for this date */}
                  <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                    {day.quizzes.map((quiz) => {
                      const quizAccuracy = Math.round((quiz.score / quiz.totalQuestions) * 100);
                      return (
                        <Link
                          key={quiz.attemptId}
                          href={`/quiz/${quiz.quizId}/results?attempt=${quiz.attemptId}`}
                          className="block p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900">
                                {SUBJECT_LABELS[quiz.subject as keyof typeof SUBJECT_LABELS]}
                                {quiz.theme && (
                                  <span className="text-gray-500 font-normal">
                                    {" "}
                                    - {quiz.theme}
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-gray-500">
                                {DIFFICULTY_LABELS[quiz.difficulty as keyof typeof DIFFICULTY_LABELS]}
                                {" "}&middot;{" "}
                                {quiz.totalQuestions} questions
                                {" "}&middot;{" "}
                                {formatTime(quiz.timeTakenSeconds)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={cn("text-lg font-semibold", getAccuracyColor(quizAccuracy))}>
                                {quiz.score}/{quiz.totalQuestions}
                              </p>
                              <p className="text-xs text-gray-400">
                                {quizAccuracy}%
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
