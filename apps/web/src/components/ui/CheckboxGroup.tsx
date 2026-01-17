"use client";

import { cn } from "@/lib/utils";

interface CheckboxOption {
  value: string;
  label: string;
  description?: string;
}

interface CheckboxGroupProps {
  name: string;
  label?: string;
  options: CheckboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  orientation?: "horizontal" | "vertical";
}

export function CheckboxGroup({
  name,
  label,
  options,
  value,
  onChange,
  className,
  orientation = "vertical",
}: CheckboxGroupProps) {
  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      // Don't allow deselecting if it's the only one selected
      if (value.length > 1) {
        onChange(value.filter((v) => v !== optionValue));
      }
    } else {
      onChange([...value, optionValue]);
    }
  };

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
        {options.map((option) => {
          const isChecked = value.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex items-start cursor-pointer p-3 rounded-lg border transition-colors",
                isChecked
                  ? "border-primary-500 bg-primary-50"
                  : "border-gray-200 hover:bg-gray-50"
              )}
            >
              <input
                type="checkbox"
                name={name}
                value={option.value}
                checked={isChecked}
                onChange={() => handleToggle(option.value)}
                className="sr-only"
              />
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded border-2 mr-3 flex-shrink-0",
                  isChecked
                    ? "border-primary-500 bg-primary-500"
                    : "border-gray-300"
                )}
              >
                {isChecked && (
                  <svg
                    className="h-3 w-3 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isChecked ? "text-primary-700" : "text-gray-900"
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
          );
        })}
      </div>
    </div>
  );
}
