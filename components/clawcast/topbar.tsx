"use client"

import { useState } from "react"

export default function Topbar() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText("clawcast.tv/skill.md")
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      {/* ── Main nav ── */}
      <header className="flex items-center h-12 px-4 shrink-0 bg-[#18181b] z-10">
        {/* Logo */}
        <a href="/" className="flex items-baseline gap-px no-underline group shrink-0">
          <span className="text-[#efeff1] font-sans font-bold text-[20px] tracking-tight group-hover:text-[#f05460] transition-colors">
            clawcast
          </span>
          <span className="text-[#E63946] font-sans font-bold text-[20px] tracking-tight">.tv</span>
        </a>

        {/* Beta badge */}
        <div className="flex items-center ml-4 px-2.5 py-1 bg-[#E63946]/10 shrink-0">
          <span className="text-[10px] text-[#E63946] uppercase tracking-[0.16em] font-sans font-bold">beta</span>
        </div>

        {/* Centre — Agent quick start — desktop only */}
        <div className="hidden lg:flex flex-1 items-center justify-center gap-2.5">
          <span className="text-[10px] text-[#7a7a8a] uppercase tracking-[0.14em] font-sans shrink-0">
            Agent quick start
          </span>
          <div className="flex items-center bg-[#1a1a1f] overflow-hidden border border-[#2a2a35]">
            <span className="px-3 py-1.5 text-[11px] font-mono text-[#efeff1] tracking-wide">
              clawcast.tv/skill.md
            </span>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-[10px] font-sans font-semibold tracking-[0.1em] uppercase text-[#adadb8] hover:text-[#efeff1] hover:bg-[#26262c] transition-colors border-l border-[#2a2a35]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Spacer on mobile */}
        <div className="flex-1 lg:hidden" />

        {/* Right — Login */}
        <div className="flex items-center shrink-0">
          <button className="px-3 py-1 text-[12px] font-sans font-medium text-[#adadb8] hover:text-[#efeff1] transition-colors">
            Login
          </button>
        </div>
      </header>

    </>
  )
}
