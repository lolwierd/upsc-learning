"use client";

import { useState, useEffect } from "react";
import { Select, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Frequency = "daily" | "weekly" | "monthly" | "custom";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`,
}));

const MINUTES = [
  { value: "0", label: ":00" },
  { value: "15", label: ":15" },
  { value: "30", label: ":30" },
  { value: "45", label: ":45" },
];

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "America/New_York", label: "US Eastern (EST/EDT)" },
  { value: "America/Los_Angeles", label: "US Pacific (PST/PDT)" },
  { value: "Europe/London", label: "UK (GMT/BST)" },
  { value: "UTC", label: "UTC" },
];

interface ScheduleBuilderProps {
  initialCron?: string;
  initialTimezone?: string;
  onSave: (cronExpression: string, timezone: string) => void;
  onCancel: () => void;
}

export function ScheduleBuilder({
  initialCron,
  initialTimezone,
  onSave,
  onCancel,
}: ScheduleBuilderProps) {
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Weekdays
  const [hour, setHour] = useState("9");
  const [minute, setMinute] = useState("0");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [customCron, setCustomCron] = useState("");
  const [timezone, setTimezone] = useState(initialTimezone || "Asia/Kolkata");
  const [error, setError] = useState<string | null>(null);

  // Parse initial cron if provided
  useEffect(() => {
    if (initialCron) {
      parseCron(initialCron);
    }
  }, [initialCron]);

  const parseCron = (cron: string) => {
    const parts = cron.split(" ");
    if (parts.length !== 5) {
      setFrequency("custom");
      setCustomCron(cron);
      return;
    }

    const [min, hr, dom, , dow] = parts;

    // Set time
    if (min !== "*") setMinute(min);
    if (hr !== "*") setHour(hr);

    // Determine frequency
    if (dow !== "*" && dom === "*") {
      setFrequency("weekly");
      const days = dow.split(",").map(Number);
      setSelectedDays(days);
    } else if (dom !== "*" && dow === "*") {
      setFrequency("monthly");
      setDayOfMonth(dom);
    } else if (dow === "*" && dom === "*") {
      setFrequency("daily");
    } else {
      setFrequency("custom");
      setCustomCron(cron);
    }
  };

  const buildCron = (): string => {
    if (frequency === "custom") {
      return customCron;
    }

    const min = minute;
    const hr = hour;

    switch (frequency) {
      case "daily":
        return `${min} ${hr} * * *`;
      case "weekly":
        return `${min} ${hr} * * ${selectedDays.sort().join(",")}`;
      case "monthly":
        return `${min} ${hr} ${dayOfMonth} * *`;
      default:
        return "";
    }
  };

  const getNextRunPreview = (): string => {
    const cronStr = buildCron();
    if (!cronStr) return "";

    try {
      // Simple preview based on frequency
      const timeStr = `${HOURS.find(h => h.value === hour)?.label}${MINUTES.find(m => m.value === minute)?.label.replace(":", "")}`;

      switch (frequency) {
        case "daily":
          return `Every day at ${timeStr}`;
        case "weekly":
          if (selectedDays.length === 0) return "No days selected";
          const dayNames = selectedDays
            .sort()
            .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label)
            .join(", ");
          return `Every ${dayNames} at ${timeStr}`;
        case "monthly":
          return `Every month on day ${dayOfMonth} at ${timeStr}`;
        case "custom":
          return `Custom: ${cronStr}`;
        default:
          return "";
      }
    } catch {
      return "Invalid schedule";
    }
  };

  const handleSave = () => {
    setError(null);
    const cron = buildCron();

    if (!cron) {
      setError("Please configure a valid schedule");
      return;
    }

    if (frequency === "weekly" && selectedDays.length === 0) {
      setError("Please select at least one day");
      return;
    }

    // Basic cron validation
    const parts = cron.split(" ");
    if (parts.length !== 5) {
      setError("Invalid cron expression (must have 5 parts)");
      return;
    }

    onSave(cron, timezone);
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day]
    );
  };

  return (
    <div className="space-y-4">
      {/* Frequency */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Frequency
        </label>
        <div className="flex flex-wrap gap-2">
          {(["daily", "weekly", "monthly", "custom"] as Frequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                frequency === f
                  ? "bg-primary-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Day Selection (Weekly) */}
      {frequency === "weekly" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Days
          </label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={cn(
                  "w-10 h-10 rounded-full text-sm font-medium transition-colors",
                  selectedDays.includes(day.value)
                    ? "bg-primary-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day of Month (Monthly) */}
      {frequency === "monthly" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Day of Month
          </label>
          <select
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {Array.from({ length: 28 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Custom Cron */}
      {frequency === "custom" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cron Expression
          </label>
          <input
            type="text"
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            placeholder="* * * * *"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Format: minute hour day-of-month month day-of-week
          </p>
        </div>
      )}

      {/* Time */}
      {frequency !== "custom" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time
          </label>
          <div className="flex gap-2">
            <select
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
            <select
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {MINUTES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Timezone */}
      <Select
        id="timezone"
        label="Timezone"
        options={TIMEZONES}
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
      />

      {/* Preview */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-500 mb-1">Schedule Preview</p>
        <p className="text-sm font-medium text-gray-900">{getNextRunPreview()}</p>
        {frequency !== "custom" && (
          <p className="text-xs text-gray-400 mt-1 font-mono">{buildCron()}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} className="flex-1">
          Save Schedule
        </Button>
      </div>
    </div>
  );
}
