"use client";

import { useMemo, useState } from "react";

interface ActivityDay {
  date: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
}

interface PerformanceGraphProps {
  activity: ActivityDay[];
  className?: string;
}

type TimeRange = "7" | "30" | "90" | "all";

export function PerformanceGraph({ activity, className = "" }: PerformanceGraphProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7");

  // Filter and calculate cumulative data based on time range
  const chartData = useMemo(() => {
    // Sort by date
    const sorted = [...activity].sort((a, b) => a.date.localeCompare(b.date));

    // Filter by time range
    const now = new Date();
    let filtered = sorted;

    if (timeRange !== "all") {
      const daysAgo = parseInt(timeRange);
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - daysAgo);
      filtered = sorted.filter((d) => new Date(d.date) >= cutoff);
    }

    // Calculate cumulative totals
    let cumulativeCorrect = 0;
    let cumulativeWrong = 0;

    return filtered.map((day) => {
      cumulativeCorrect += day.correct;
      cumulativeWrong += day.total - day.correct;
      return {
        date: day.date,
        correct: cumulativeCorrect,
        wrong: cumulativeWrong,
        dailyCorrect: day.correct,
        dailyWrong: day.total - day.correct,
      };
    });
  }, [activity, timeRange]);

  // Calculate graph dimensions and scales
  const { maxValue, points } = useMemo(() => {
    if (chartData.length === 0) {
      return { maxValue: 100, points: { correct: "", wrong: "" } };
    }

    const maxVal = Math.max(
      ...chartData.map((d) => Math.max(d.correct, d.wrong)),
      10 // Minimum for empty state
    );

    // SVG dimensions
    const width = 100;
    const height = 100;
    const padding = 5;

    // Create path points
    const createPath = (values: number[]) => {
      if (values.length === 0) return "";

      const points = values.map((v, i) => {
        const x = padding + (i / Math.max(values.length - 1, 1)) * (width - 2 * padding);
        const y = height - padding - (v / maxVal) * (height - 2 * padding);
        return `${x},${y}`;
      });

      return `M ${points.join(" L ")}`;
    };

    return {
      maxValue: maxVal,
      points: {
        correct: createPath(chartData.map((d) => d.correct)),
        wrong: createPath(chartData.map((d) => d.wrong)),
      },
    };
  }, [chartData]);

  const latestData = chartData[chartData.length - 1];

  return (
    <div className={className}>
      {/* Time range selector */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "all", label: "All time" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeRange(option.value as TimeRange)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                timeRange === option.value
                  ? "bg-primary-100 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats summary */}
      <div className="flex gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm text-gray-600">
            Correct: <span className="font-medium text-gray-900">{latestData?.correct ?? 0}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-sm text-gray-600">
            Wrong: <span className="font-medium text-gray-900">{latestData?.wrong ?? 0}</span>
          </span>
        </div>
      </div>

      {/* Graph */}
      {chartData.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
          No data for this time range
        </div>
      ) : (
        <div className="relative h-32 w-full">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            {/* Grid lines */}
            <line x1="5" y1="95" x2="95" y2="95" stroke="#e5e7eb" strokeWidth="0.5" />
            <line x1="5" y1="50" x2="95" y2="50" stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="5" y1="5" x2="95" y2="5" stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2,2" />

            {/* Wrong line (red) */}
            {points.wrong && (
              <path
                d={points.wrong}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Correct line (green) */}
            {points.correct && (
              <path
                d={points.correct}
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-400 -ml-1">
            <span>{maxValue}</span>
            <span>{Math.round(maxValue / 2)}</span>
            <span>0</span>
          </div>
        </div>
      )}

      {/* Date range labels */}
      {chartData.length > 0 && (
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{chartData[0].date}</span>
          <span>{chartData[chartData.length - 1].date}</span>
        </div>
      )}
    </div>
  );
}
