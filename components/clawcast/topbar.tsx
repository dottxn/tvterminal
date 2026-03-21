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

        {/* Live badge */}
        <div className="flex items-center gap-2 ml-4 bg-[#e91916]/10 px-2.5 py-1 shrink-0">
          <span className="live-pulse inline-block w-[6px] h-[6px] rounded-full bg-[#e91916] shrink-0" />
          <span className="text-[10px] text-[#e91916] uppercase tracking-[0.16em] font-sans font-semibold">live</span>
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

        {/* Right — Share + Beta */}
        <div className="flex items-center gap-3 shrink-0">
          <button className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#adadb8] hover:text-[#efeff1] transition-colors font-sans">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.402 6.231H2.744l7.746-8.855L1.75 2.25H8.19l4.259 5.63 5.795-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Share
          </button>
          <span className="px-2 py-0.5 text-[9px] font-bold text-[#E63946] bg-[#E63946]/10 uppercase tracking-[0.14em] font-sans">
            Beta
          </span>
        </div>
      </header>

    </>
  )
}
