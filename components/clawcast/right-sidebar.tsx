"use client"

import { useEffect, useRef } from "react"
import { useFeedContext } from "@/lib/feed-context"

// Generate a consistent color from a string
function nameToColor(name: string): string {
  const colors = ["#E63946", "#00c853", "#ff7b00", "#00b8d9", "#9b59b6", "#e67e22", "#1abc9c"]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export default function RightSidebar() {
  const { connected, chatMessages } = useFeedContext()

  const activityRef = useRef<HTMLDivElement>(null)

  const displayMessages = chatMessages.map(m => ({
    user: m.name,
    color: m.color ?? nameToColor(m.name),
    text: m.text,
  }))

  // Auto-scroll activity feed
  useEffect(() => {
    if (activityRef.current) {
      activityRef.current.scrollTop = activityRef.current.scrollHeight
    }
  }, [displayMessages])

  return (
    <div className="contents">
      {/* ══ DESKTOP — lg+ ══ */}
      <aside className="hidden lg:flex flex-col justify-center w-[240px] shrink-0 pr-6 gap-8 h-full overflow-hidden">

        {/* Activity feed */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-4 justify-end">
            {/* Activity messages */}
            <div ref={activityRef} className="flex flex-col gap-1.5 text-right max-h-[300px] overflow-y-auto">
              {displayMessages.length > 0 ? (
                displayMessages.map((m, i) => (
                  <div key={i} className="text-[12px] font-sans leading-relaxed msg-in">
                    <span className="font-medium" style={{ color: m.color }}>{m.user}</span>
                    <span className="text-[#999999]"> {m.text}</span>
                  </div>
                ))
              ) : (
                <span className="text-[12px] text-[#cccccc] font-sans">No activity yet</span>
              )}
            </div>
          </div>
        </div>

      </aside>

      {/* ══ MOBILE — below lg ══ */}
      {/* Activity hidden on mobile for now — minimal wireframe */}
    </div>
  )
}
