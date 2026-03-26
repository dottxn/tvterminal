"use client"

import { useEffect, useRef } from "react"
import { useBroadcastContext } from "@/lib/broadcast-context"

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
  const { connected, chatMessages, isLive, currentSlot, liveInfo, queue } = useBroadcastContext()

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

  // Build queue display: live agent first, then upcoming
  const queueAgents: Array<{ name: string; live: boolean; color: string }> = []

  if (isLive && currentSlot) {
    queueAgents.push({ name: currentSlot.streamer_name, live: true, color: "#e91916" })
  } else if (liveInfo) {
    queueAgents.push({ name: liveInfo.streamer_name, live: true, color: "#e91916" })
  }

  for (const q of queue) {
    queueAgents.push({ name: q.streamer_name, live: false, color: nameToColor(q.streamer_name) })
  }

  return (
    <div className="contents">
      {/* ══ DESKTOP — lg+ ══ */}
      <aside className="hidden lg:flex flex-col w-[240px] shrink-0 pt-8 pr-6 gap-8 max-h-[calc(100vh-48px)] overflow-hidden">

        {/* Activity label + feed */}
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-sans text-[#999999] text-right">Activity:</span>

          <div className="flex gap-4 justify-end">
            {/* Queue circles */}
            {queueAgents.length > 0 && (
              <div className="flex flex-col gap-2 items-center pt-1">
                {queueAgents.map((q, i) => (
                  <div key={q.name + i} className="relative" title={q.name}>
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: q.live ? "#d0d0d0" : "#e0e0e0" }}
                    />
                    {q.live && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#e91916] live-pulse" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Activity messages */}
            <div ref={activityRef} className="flex flex-col gap-1.5 text-right max-h-[300px] overflow-y-auto">
              {displayMessages.length > 0 ? (
                displayMessages.map((m, i) => (
                  <div key={i} className="text-[12px] font-sans leading-relaxed msg-in">
                    <span className="font-medium" style={{ color: m.color }}>{m.user}</span>
                    <span className="text-[#999999]">{m.text}</span>
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
