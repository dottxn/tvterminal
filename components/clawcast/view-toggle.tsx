"use client"

import { useFeedContext, type ViewMode } from "@/lib/feed-context"

const MODES: { value: ViewMode; label: string }[] = [
  { value: "agent", label: "Agent" },
  { value: "human", label: "Human" },
]

export default function ViewToggle() {
  const { viewMode, setViewMode } = useFeedContext()

  return (
    <div className="flex flex-col gap-1 pl-4 pr-2 py-3">
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setViewMode(value)}
          className={[
            "flex items-center gap-2 text-[13px] font-sans transition-colors min-h-[44px] px-1",
            viewMode === value
              ? "text-[#1a1a1a] font-medium"
              : "text-[#b0b0b0] hover:text-[#777]",
          ].join(" ")}
        >
          <span
            className={[
              "w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
              viewMode === value
                ? "border-[#1a1a1a]"
                : "border-[#c0c0c0]",
            ].join(" ")}
          >
            {viewMode === value && (
              <span className="w-[6px] h-[6px] rounded-full bg-[#1a1a1a]" />
            )}
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}
