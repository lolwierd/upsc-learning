"use client";

import { cn } from "@/lib/utils";

interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  name: string;
  label?: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  orientation?: "horizontal" | "vertical";
}

export function RadioGroup({
  name,
  label,
  options,
  value,
  onChange,
  className,
  orientation = "vertical",
}: RadioGroupProps) {
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <p className="block text-sm font-medium text-gray-700 mb-2">{label}</p>
      )}
      <div
        className={cn(
          "flex gap-3",
          orientation === "vertical" ? "flex-col" : "flex-row flex-wrap"
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "relative flex items-start cursor-pointer p-3 rounded-lg border transition-colors",
              value === option.value
                ? "border-primary-500 bg-primary-50"
                : "border-gray-200 hover:bg-gray-50"
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange(e.target.value)}
              className="sr-only"
            />
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border-2 mr-3 flex-shrink-0",
                value === option.value
                  ? "border-primary-500"
                  : "border-gray-300"
              )}
            >
              {value === option.value && (
                <div className="h-2.5 w-2.5 rounded-full bg-primary-500" />
              )}
            </div>
            <div className="flex-1">
              <span
                className={cn(
                  "text-sm font-medium",
                  value === option.value ? "text-primary-700" : "text-gray-900"
                )}
              >
                {option.label}
              </span>
              {option.description && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {option.description}
                </p>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
