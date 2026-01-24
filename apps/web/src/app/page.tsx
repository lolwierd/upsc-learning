"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { getHistory, getQuizSets } from "@/lib/api";
import type { QuizHistoryItem, QuizSetListItem } from "@mcqs/shared";
import { SUBJECT_LABELS, DIFFICULTY_LABELS } from "@mcqs/shared";

export default function Home() {
  const [recentQuizzes, setRecentQuizzes] = useState<QuizHistoryItem[]>([]);
  const [quizSets, setQuizSets] = useState<QuizSetListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [historyData, setsData] = await Promise.all([
          getHistory({ limit: 10 }),
          getQuizSets(),
        ]);
        setRecentQuizzes(historyData.quizzes);
        setQuizSets(setsData.sets);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Show only first 4 quizzes in grid
  const displayedQuizzes = recentQuizzes.slice(0, 4);
  const hasMoreQuizzes = recentQuizzes.length > 4;

  // Show only first 3 quiz sets
  const displayedSets = quizSets.slice(0, 3);
  const hasMoreSets = quizSets.length > 3;

  const formatNextRun = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `in ${diffDays}d`;
    } else if (diffHours > 0) {
      return `in ${diffHours}h`;
    } else {
      return "soon";
    }
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const dateStr = date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr} · ${timeStr}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header with New Quiz button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Track your UPSC preparation progress</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sets"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Quiz Sets
          </Link>
          <Link
            href="/quiz/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_12px_rgba(0,102,255,0.15)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Quiz
          </Link>
        </div>
      </div>

      {/* Quiz Sets */}
      {(displayedSets.length > 0 || loading) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">Your Quiz Sets</h2>
            {hasMoreSets && (
              <Link href="/sets" className="text-xs text-primary-500 hover:text-primary-600 font-medium">
                View all →
              </Link>
            )}
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {displayedSets.map((set) => (
                <Link key={set.id} href={`/sets/${set.id}`}>
                  <Card className="p-4 h-full hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] transition-shadow">
                    <div className="flex flex-col h-full">
                      <h3 className="font-medium text-gray-900 text-sm truncate mb-1">
                        {set.name}
                      </h3>
                      <p className="text-xs text-gray-500 mb-2">
                        {set.itemCount} quiz{set.itemCount !== 1 ? "zes" : ""}
                      </p>
                      {set.schedule?.isEnabled && (
                        <div className="mt-auto flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          <span className="text-xs text-green-600">
                            Next {set.schedule.nextRunAt ? formatNextRun(set.schedule.nextRunAt) : "soon"}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
              <Link href="/sets/new">
                <Card className="p-4 h-full border-2 border-dashed border-gray-200 hover:border-primary-300 transition-colors flex items-center justify-center min-h-[100px]">
                  <div className="text-center">
                    <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-xs text-gray-500">New Set</span>
                  </div>
                </Card>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Recent Quizzes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-700">Recent Quizzes</h2>
          {hasMoreQuizzes && (
            <Link href="/history" className="text-xs text-primary-500 hover:text-primary-600 font-medium">
              View all →
            </Link>
          )}
        </div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </Card>
            ))}
          </div>
        ) : displayedQuizzes.length === 0 ? (
          <Card className="p-4">
            <p className="text-gray-500 text-center text-sm">
              No quizzes yet. Create your first quiz!
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayedQuizzes.map((quiz) => (
              <Card key={quiz.id} className="p-4 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] transition-shadow">
                <Link href={`/quiz/${quiz.id}`} className="block">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {SUBJECT_LABELS[quiz.subject as keyof typeof SUBJECT_LABELS]}
                        {quiz.theme && ` - ${quiz.theme}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDateTime(quiz.createdAt)} &middot; {quiz.questionCount} questions &middot;{" "}
                        {DIFFICULTY_LABELS[quiz.difficulty as keyof typeof DIFFICULTY_LABELS]}
                      </p>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      {quiz.score !== undefined && quiz.attemptStatus === "completed" ? (
                        <p className="text-base font-semibold text-primary-600">
                          {quiz.score}/{quiz.questionCount}
                        </p>
                      ) : quiz.attemptStatus === "in_progress" ? (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          In Progress
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
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
