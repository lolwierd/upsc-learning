"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { getStats, getHistory, getActivity } from "@/lib/api";
import { ContributionGraph } from "@/components/ContributionGraph";
import { PerformanceGraph } from "@/components/PerformanceGraph";
import type { UserStats, QuizHistoryItem } from "@mcqs/shared";
import { SUBJECT_LABELS, DIFFICULTY_LABELS } from "@mcqs/shared";

interface ActivityDay {
  date: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
}

export default function Home() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [recentQuizzes, setRecentQuizzes] = useState<QuizHistoryItem[]>([]);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, historyData, activityData] = await Promise.all([
          getStats(),
          getHistory({ limit: 5 }),
          getActivity(365),
        ]);
        setStats(statsData);
        setRecentQuizzes(historyData.quizzes);
        setActivity(activityData.activity);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalAttempts = stats?.overall.totalAttempts ?? 0;
  const totalQuestions = stats?.overall.totalQuestions ?? 0;
  const accuracy = stats?.overall.accuracy ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* New Quiz Card */}
        <Card className="md:col-span-2">
          <CardTitle>Start a New Quiz</CardTitle>
          <p className="text-gray-600 mt-2 mb-6">
            Generate UPSC-style MCQs on any subject and theme. Choose your
            difficulty, question style, and get started.
          </p>
          <Link
            href="/quiz/new"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            Create New Quiz
          </Link>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardTitle>Quick Stats</CardTitle>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-gray-500">Quizzes Taken</p>
              <p className="text-2xl font-semibold text-gray-900">
                {loading ? "..." : totalAttempts}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Average Score</p>
              <p className="text-2xl font-semibold text-gray-900">
                {loading ? "..." : totalAttempts > 0 ? `${Math.round(accuracy)}%` : "--"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Questions Answered</p>
              <p className="text-2xl font-semibold text-gray-900">
                {loading ? "..." : totalQuestions}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Activity Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Contribution Graph */}
        <Card>
          <CardTitle>Activity</CardTitle>
          <p className="text-sm text-gray-500 mb-4">
            Your quiz activity over the past year. Darker green = higher accuracy.
          </p>
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin h-6 w-6 border-4 border-primary-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <ContributionGraph activity={activity} />
          )}
        </Card>

        {/* Performance Graph */}
        <Card>
          <CardTitle>Performance</CardTitle>
          <p className="text-sm text-gray-500 mb-4">
            Cumulative correct vs wrong answers over time.
          </p>
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin h-6 w-6 border-4 border-primary-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <PerformanceGraph activity={activity} />
          )}
        </Card>
      </div>

      {/* Recent Quizzes */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Quizzes
        </h2>
        {loading ? (
          <Card>
            <p className="text-gray-500 text-center py-8">Loading...</p>
          </Card>
        ) : recentQuizzes.length === 0 ? (
          <Card>
            <p className="text-gray-500 text-center py-8">
              No quizzes yet. Create your first quiz to get started!
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {recentQuizzes.map((quiz) => (
              <Card key={quiz.id} className="hover:bg-gray-50 transition-colors">
                <Link href={`/quiz/${quiz.id}`} className="block">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {SUBJECT_LABELS[quiz.subject as keyof typeof SUBJECT_LABELS]}
                        {quiz.theme && ` - ${quiz.theme}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {quiz.questionCount} questions &middot;{" "}
                        {DIFFICULTY_LABELS[quiz.difficulty as keyof typeof DIFFICULTY_LABELS]}
                      </p>
                    </div>
                    <div className="text-right">
                      {quiz.score !== undefined && quiz.attemptStatus === "completed" ? (
                        <p className="text-lg font-semibold text-primary-600">
                          {quiz.score}/{quiz.questionCount}
                        </p>
                      ) : quiz.attemptStatus === "in_progress" ? (
                        <span className="text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          In Progress
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">Not started</span>
                      )}
                    </div>
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
