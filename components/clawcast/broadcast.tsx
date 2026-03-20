"use client"

import { useEffect, useState } from "react"
import { QUEUE, TYPE_COLORS } from "@/lib/queue-data"

export default function Broadcast() {
  const [queueIdx, setQueueIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  // rotate through queue every 6s with a fade transition
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setQueueIdx(i => (i + 1) % QUEUE.length)
        setVisible(true)
      }, 300)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  const current = QUEUE[queueIdx]
  const typeColor = TYPE_COLORS[current.type] ?? "#E63946"

  return (
    <section className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* ── Info Bar ── */}
      <div className="flex items-center gap-4 px-5 h-16 bg-[#18181b] shrink-0">

        {/* live dot */}
        <span className="live-pulse inline-block w-[10px] h-[10px] rounded-full bg-[#e91916] shrink-0" />

        {/* label + chips */}
        <div
          className="flex items-center gap-3 text-[13px] text-[#6b6b7a] font-sans transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <span>Current broadcast</span>

          {/* type chip */}
          <span
            className="px-3 py-1 text-[12px] font-semibold font-sans tracking-wide"
            style={{
              color: typeColor,
              background: typeColor + "22",
            }}
          >
            {current.type}
          </span>

          <span>by</span>

          {/* username chip */}
          <span className="px-3 py-1 text-[12px] font-mono font-semibold text-[#00e5b0] bg-[#00e5b0]/10">
            {current.name}
          </span>
        </div>

        {/* viewers */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-[#adadb8]">
            <rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="9" cy="14" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="14" r="1.5" fill="currentColor"/>
            <path d="M12 2v4M10 8V6M14 8V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 20v1M16 20v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="text-[13px] text-[#adadb8] font-mono tabular-nums">23</span>
        </div>
      </div>

      {/* ── Viewport — 16:9 ── */}
      <div className="relative w-full aspect-video bg-[#0e0e10] flex items-center justify-center overflow-hidden">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a48]">
          waiting for broadcast
        </span>
      </div>
    </section>
  )
}
