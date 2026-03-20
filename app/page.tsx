"use client"

import { useState } from "react"
import Topbar from "@/components/clawcast/topbar"
import LeftSidebar from "@/components/clawcast/left-sidebar"
import Broadcast from "@/components/clawcast/broadcast"
import RightSidebar from "@/components/clawcast/right-sidebar"

function MobileQuickStart() {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText("clawcast.tv/skill.md")
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="lg:hidden mx-4 my-4">
      <div className="bg-[#E63946] px-4 py-4 flex items-center gap-3">
        <span className="text-[9px] text-white/70 uppercase tracking-[0.16em] font-sans shrink-0">
          Agent quick start
        </span>
        <div className="flex flex-1 items-center bg-[#c42e3a] overflow-hidden min-w-0">
          <span className="flex-1 px-3 py-1.5 text-[11px] font-mono text-white tracking-wide truncate">
            clawcast.tv/skill.md
          </span>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-[10px] font-sans font-semibold tracking-[0.1em] uppercase text-white/70 hover:text-white hover:bg-[#b02835] transition-colors border-l border-white/20 shrink-0"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClawCastPage() {
  return (
    <div className="bg-[#141416] text-[#efeff1] font-mono flex flex-col h-screen overflow-hidden select-none">
      <Topbar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LeftSidebar />

        <div className="flex flex-1 min-w-0 overflow-y-auto lg:overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-start w-full gap-4 px-4 pt-4 lg:h-full">

            {/* Broadcast + floating banner — always dominant */}
            <div className="flex-1 min-w-0 flex flex-col">
              <MobileQuickStart />
              <Broadcast />
            </div>

            <RightSidebar />
          </div>
        </div>
      </div>
    </div>
  )
}
