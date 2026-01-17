"use client";

import { useMemo, useState, useEffect, useRef } from "react";

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
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [animationProgress, setAnimationProgress] = useState(0);
  const [_hasAnimated, setHasAnimated] = useState(false);
  const correctPathRef = useRef<SVGPathElement>(null);
  const wrongPathRef = useRef<SVGPathElement>(null);

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

  // Animate line drawing on mount or data change
  useEffect(() => {
    setHasAnimated(false);
    setAnimationProgress(0);

    const duration = 1000; // ms
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimationProgress(eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setHasAnimated(true);
      }
    };

    requestAnimationFrame(animate);
  }, [chartData]);

  // Calculate graph dimensions and scales
  const { maxValue, points, pathLengths: _pathLengths } = useMemo(() => {
    if (chartData.length === 0) {
      return { maxValue: 100, points: { correct: "", wrong: "" }, pathLengths: { correct: 0, wrong: 0 } };
    }

    const maxVal = Math.max(
      ...chartData.map((d) => Math.max(d.correct, d.wrong)),
      10 // Minimum for empty state
    );

    // SVG dimensions
    const width = 100;
    const height = 100;
    const padding = 8;

    // Create path points - if single point, create a horizontal line
    const createPath = (values: number[]) => {
      if (values.length === 0) return "";

      // For single data point, draw from left edge to the point
      if (values.length === 1) {
        const y = height - padding - (values[0] / maxVal) * (height - 2 * padding);
        return `M ${padding},${y} L ${width - padding},${y}`;
      }

      const points = values.map((v, i) => {
        const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
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
      pathLengths: { correct: 1000, wrong: 1000 },
    };
  }, [chartData]);

  const latestData = chartData[chartData.length - 1];

  // Calculate actual path lengths after render
  useEffect(() => {
    if (correctPathRef.current) {
      const length = correctPathRef.current.getTotalLength();
      correctPathRef.current.style.strokeDasharray = `${length}`;
      correctPathRef.current.style.strokeDashoffset = `${length * (1 - animationProgress)}`;
    }
    if (wrongPathRef.current) {
      const length = wrongPathRef.current.getTotalLength();
      wrongPathRef.current.style.strokeDasharray = `${length}`;
      wrongPathRef.current.style.strokeDashoffset = `${length * (1 - animationProgress)}`;
    }
  }, [animationProgress, points]);

  return (
    <div className={className}>
      {/* Time range selector */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {[
            { value: "7", label: "7d" },
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
            { value: "all", label: "All" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeRange(option.value as TimeRange)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                timeRange === option.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Stats summary */}
        <div className="flex gap-4 ml-auto">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
            <span className="text-sm text-gray-600">
              Correct: <span className="font-semibold text-gray-900">{latestData?.correct ?? 0}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-sm text-gray-600">
              Wrong: <span className="font-semibold text-gray-900">{latestData?.wrong ?? 0}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Graph */}
      {chartData.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
          No data for this time range
        </div>
      ) : (
        <div className="relative h-40 w-full">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            {/* Grid lines */}
            <line x1="5" y1="95" x2="95" y2="95" stroke="#f3f4f6" strokeWidth="0.5" />
            <line x1="5" y1="70" x2="95" y2="70" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="1,1" />
            <line x1="5" y1="45" x2="95" y2="45" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="1,1" />
            <line x1="5" y1="20" x2="95" y2="20" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="1,1" />

            {/* Wrong line (red) */}
            {points.wrong && (
              <path
                ref={wrongPathRef}
                d={points.wrong}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Correct line (primary) */}
            {points.correct && (
              <path
                ref={correctPathRef}
                d={points.correct}
                fill="none"
                stroke="#0066ff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-gray-400 -ml-1 py-1">
            <span>{maxValue}</span>
            <span>{Math.round(maxValue * 0.66)}</span>
            <span>{Math.round(maxValue * 0.33)}</span>
            <span>0</span>
          </div>
        </div>
      )}

      {/* X-axis date labels */}
      {chartData.length > 0 && (
        <div className="flex justify-between text-[10px] text-gray-400 mt-2 px-1">
          <span>{new Date(chartData[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          <span>{new Date(chartData[chartData.length - 1].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>
      )}
    </div>
  );
}
