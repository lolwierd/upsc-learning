"use client";

import { useMemo } from "react";

interface ActivityDay {
  date: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
}

interface ContributionGraphProps {
  activity: ActivityDay[];
  className?: string;
}

export function ContributionGraph({ activity, className = "" }: ContributionGraphProps) {
  // Create a map of date to activity for quick lookup
  const activityMap = useMemo(() => {
    const map = new Map<string, ActivityDay>();
    activity.forEach((day) => {
      map.set(day.date, day);
    });
    return map;
  }, [activity]);

  // Generate the last 365 days
  const days = useMemo(() => {
    const result: { date: string; dayOfWeek: number; week: number }[] = [];
    const today = new Date();

    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      result.push({
        date: date.toISOString().split("T")[0],
        dayOfWeek: date.getDay(),
        week: Math.floor((364 - i + (6 - today.getDay())) / 7),
      });
    }

    return result;
  }, []);

  // Get color based on accuracy
  const getColor = (date: string) => {
    const dayActivity = activityMap.get(date);
    if (!dayActivity || dayActivity.attempts === 0) {
      return "bg-gray-100";
    }

    const accuracy = dayActivity.accuracy;
    if (accuracy >= 80) return "bg-green-500";
    if (accuracy >= 60) return "bg-green-400";
    if (accuracy >= 40) return "bg-green-300";
    if (accuracy >= 20) return "bg-green-200";
    return "bg-green-100";
  };

  // Get tooltip text
  const getTooltip = (date: string) => {
    const dayActivity = activityMap.get(date);
    if (!dayActivity || dayActivity.attempts === 0) {
      return `${date}: No activity`;
    }
    return `${date}: ${dayActivity.correct}/${dayActivity.total} correct (${dayActivity.accuracy}%)`;
  };

  // Group days by week
  const weeks = useMemo(() => {
    const weekMap = new Map<number, typeof days>();
    days.forEach((day) => {
      if (!weekMap.has(day.week)) {
        weekMap.set(day.week, []);
      }
      weekMap.get(day.week)!.push(day);
    });
    return Array.from(weekMap.entries()).sort((a, b) => a[0] - b[0]);
  }, [days]);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className={`overflow-x-auto ${className}`}>
      <div className="min-w-max">
        {/* Month labels */}
        <div className="flex text-xs text-gray-500 mb-1 pl-8">
          {weeks.map(([weekNum, weekDays]) => {
            const firstDay = weekDays[0];
            const date = new Date(firstDay.date);
            const isFirstOfMonth = date.getDate() <= 7;
            return (
              <div key={weekNum} className="w-3 mr-0.5">
                {isFirstOfMonth && <span className="absolute">{months[date.getMonth()]}</span>}
              </div>
            );
          })}
        </div>

        <div className="flex">
          {/* Day labels */}
          <div className="flex flex-col text-xs text-gray-500 mr-1 justify-between py-0.5">
            <span className="h-3"></span>
            <span className="h-3">Mon</span>
            <span className="h-3"></span>
            <span className="h-3">Wed</span>
            <span className="h-3"></span>
            <span className="h-3">Fri</span>
            <span className="h-3"></span>
          </div>

          {/* Grid */}
          <div className="flex gap-0.5">
            {weeks.map(([weekNum, weekDays]) => (
              <div key={weekNum} className="flex flex-col gap-0.5">
                {[0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
                  const day = weekDays.find((d) => d.dayOfWeek === dayOfWeek);
                  if (!day) {
                    return <div key={dayOfWeek} className="w-3 h-3" />;
                  }
                  return (
                    <div
                      key={dayOfWeek}
                      className={`w-3 h-3 rounded-sm ${getColor(day.date)} cursor-pointer`}
                      title={getTooltip(day.date)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-2 text-xs text-gray-500">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-gray-100" />
          <div className="w-3 h-3 rounded-sm bg-green-100" />
          <div className="w-3 h-3 rounded-sm bg-green-200" />
          <div className="w-3 h-3 rounded-sm bg-green-300" />
          <div className="w-3 h-3 rounded-sm bg-green-400" />
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
