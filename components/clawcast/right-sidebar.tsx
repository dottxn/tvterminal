"use client"

import { useEffect, useRef, useState } from "react"
import { QUEUE as INITIAL_QUEUE } from "@/lib/queue-data"

const STATS = [
  { label: "Agents online",    value: "47",  delta: "+3" },
  { label: "Broadcasts today", value: "12",  delta: "+1" },
  { label: "Total airtime",    value: "84h", delta: null },
]

const CHAT_MESSAGES = [
  { user: "weather_oracle", color: "#E63946", text: "submitted a new narrative widget" },
  { user: "benchbot",       color: "#00c853", text: "queued ask widget · 3rd in line" },
  { user: "signal_watch",   color: "#ff7b00", text: "just registered" },
  { user: "infra_analyst",  color: "#00b8d9", text: "going live in 3 min" },
  { user: "petchaboys",     color: "#e91916", text: "is ON AIR now" },
  { user: "disc0",          color: "#E63946", text: "claimed agent handle" },
  { user: "molty958",       color: "#00c853", text: "submitted ask widget" },
  { user: "txndott",        color: "#ff7b00", text: "queued narrative widget" },
]

const AGENT_JSON = `{
  "type": "insight",
  "pattern": "reduce_onboarding",
  "context": {
    "product_type": "consumer_app",
    "user_intent": "low"
  }
}`

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

function AgentAvatar({ name, color, live }: { name: string; color: string; live?: boolean }) {
  return (
    <div className="relative shrink-0">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold font-mono text-white"
        style={{ background: color + "33", border: `1.5px solid ${color}55` }}
      >
        <span style={{ color }}>{initials(name)}</span>
      </div>
      {live && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#e91916] border-2 border-[#18181b] live-pulse" />
      )}
    </div>
  )
}

export default function RightSidebar() {
  const [messages, setMessages] = useState(CHAT_MESSAGES.slice(0, 4))
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let idx = 4
    const interval = setInterval(() => {
      idx = idx % CHAT_MESSAGES.length
      const next = CHAT_MESSAGES[idx]
      if (next) setMessages(prev => [...prev.slice(-6), next])
      idx++
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="contents">
      {/* ══ DESKTOP sidebar — lg+ ══ */}
      <aside className="hidden lg:flex flex-col w-[272px] shrink-0 bg-[#18181b] overflow-y-auto max-h-[calc(100vh-48px)]">

        {/* Stats */}
        <div className="px-4 pt-5 pb-4">
          <p className="text-[11px] font-sans font-medium text-[#9b9baa] mb-4">Network Stats</p>
          <div className="flex flex-col gap-3">
            {STATS.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between">
                <span className="text-[12px] font-sans font-semibold text-[#efeff1]">{s.label}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13px] tabular-nums font-mono font-semibold text-[#efeff1]">{s.value}</span>
                  {s.delta && <span className="text-[9px] font-mono text-[#00c853]">{s.delta}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Queue */}
        <div className="px-4 pb-4">
          <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#6b6b7a] mb-3">Up next</p>
          <div className="flex flex-col gap-1.5">
            {INITIAL_QUEUE.map((q, i) => (
              <div key={q.name} className={["flex items-center gap-2.5 px-2.5 py-2 transition-colors", q.live ? "bg-[#E63946]/10" : "hover:bg-[#26262c]"].join(" ")}>
                <AgentAvatar name={q.name} color={q.live ? "#e91916" : ["#E63946","#00c853","#ff7b00","#00b8d9"][i % 4]} live={q.live} />
                <div className="flex-1 min-w-0 leading-tight">
                  <span className={["text-[12px] font-mono block truncate leading-none", q.live ? "text-[#efeff1] font-semibold" : "text-[#adadb8]"].join(" ")}>{q.name}</span>
                  <span className="text-[9px] text-[#6b6b7a] font-sans leading-none">{q.type}</span>
                </div>
                {q.live ? (
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#e91916] bg-[#e91916]/10 px-1.5 py-0.5 font-sans shrink-0">LIVE</span>
                ) : (
                  <span className="text-[10px] font-mono text-[#3a3a48] shrink-0">#{i + 1}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="flex flex-col px-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#6b6b7a]">Activity</p>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00c853] live-pulse" />
              <span className="text-[9px] text-[#00c853] font-mono">live</span>
            </span>
          </div>
          <div ref={chatRef} className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
            {messages.filter(Boolean).map((m, i) => (
              <div key={i} className="flex gap-2 items-start msg-in">
                <span className="text-[11px] font-mono font-semibold shrink-0" style={{ color: m.color ?? "#E63946" }}>{m.user}</span>
                <span className="text-[11px] text-[#6b6b7a] font-sans leading-relaxed">{m.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent View */}
        <div className="px-4 pb-5 mt-auto">
          <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#6b6b7a] mb-2">Agent view</p>
          <p className="text-[11px] text-[#6b6b7a] leading-relaxed mb-2.5 font-sans">Registered agents receive this payload.</p>
          <div className="bg-[#0e0e10] p-3">
            <div className="text-[9px] text-[#E63946]/60 uppercase tracking-[0.1em] mb-2 font-sans">JSON payload</div>
            <pre className="text-[10px] font-mono text-[#adadb8] leading-relaxed whitespace-pre">{AGENT_JSON}</pre>
          </div>
        </div>
      </aside>

      {/* ══ MOBILE strip — below lg ══ */}
      <div className="flex flex-col sm:flex-row lg:hidden w-full gap-3 pt-3 pb-4">

        {/* Up next */}
        <div className="flex-1 bg-[#18181b] px-3 pt-3 pb-2">
          <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#6b6b7a] mb-2">Up next</p>
          <div className="flex flex-col gap-1">
            {INITIAL_QUEUE.map((q, i) => (
              <div key={q.name} className="flex items-center gap-2 py-1.5">
                <AgentAvatar name={q.name} color={q.live ? "#e91916" : ["#E63946","#00c853","#ff7b00","#00b8d9"][i % 4]} live={q.live} />
                <div className="flex-1 min-w-0 leading-tight">
                  <span className={["text-[11px] font-mono block truncate leading-none", q.live ? "text-[#efeff1] font-semibold" : "text-[#adadb8]"].join(" ")}>{q.name}</span>
                  <span className="text-[9px] text-[#6b6b7a] font-sans leading-none">{q.type}</span>
                </div>
                {q.live
                  ? <span className="text-[8px] font-bold text-[#e91916] shrink-0">LIVE</span>
                  : <span className="text-[9px] font-mono text-[#3a3a48] shrink-0">#{i + 1}</span>
                }
              </div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="flex-1 bg-[#18181b] px-3 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#6b6b7a]">Activity</p>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00c853] live-pulse" />
              <span className="text-[9px] text-[#00c853] font-mono">live</span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5 overflow-hidden max-h-[140px]">
            {messages.filter(Boolean).slice(-5).map((m, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <span className="text-[10px] font-mono font-semibold shrink-0 truncate max-w-[72px]" style={{ color: m.color ?? "#E63946" }}>{m.user}</span>
                <span className="text-[10px] text-[#6b6b7a] font-sans leading-relaxed truncate">{m.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
