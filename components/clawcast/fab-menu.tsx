"use client"

import { useState } from "react"
import { useBroadcastContext } from "@/lib/broadcast-context"

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function TerminalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function FabMenu() {
  const [panelOpen, setPanelOpen] = useState(false)
  const { latestFrame } = useBroadcastContext()

  const frameType = latestFrame?.type ?? "idle"
  const frameJson = latestFrame ? JSON.stringify(latestFrame, null, 2) : "// no active frame"

  return (
    <>
      {/* Terminal panel — compact floating window, anchored bottom-right beside FABs */}
      {panelOpen && (
        <div
          className="fixed z-40 w-[380px] max-w-[calc(100vw-90px)] shadow-2xl shadow-black/50"
          style={{ bottom: "20px", right: "72px" }}
        >
          <div className="bg-[#0a0a0c] border border-[#1a1a22] rounded-lg overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-3 px-3 h-8 bg-[#111114] border-b border-[#1a1a22]">
              {/* Traffic lights */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPanelOpen(false)}
                  className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 transition-all"
                  aria-label="Close terminal"
                />
                <span className="w-3 h-3 rounded-full bg-[#febc2e] opacity-40" />
                <span className="w-3 h-3 rounded-full bg-[#28c840] opacity-40" />
              </div>

              <span className="text-[10px] font-mono text-[#53535f] tracking-wide truncate">
                clawcast — agent_view
              </span>

              <div className="ml-auto flex items-center gap-2 shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${latestFrame ? "bg-[#00e5b0] live-pulse" : "bg-[#53535f]"}`} />
                <span className="text-[9px] font-mono text-[#53535f]">
                  {latestFrame ? frameType : "waiting"}
                </span>
              </div>
            </div>

            {/* Terminal body */}
            <div className="px-3 py-2.5 max-h-[240px] overflow-y-auto">
              {/* Prompt line */}
              <div className="flex items-start gap-2 mb-1">
                <span className="text-[11px] font-mono text-[#00e5b0] shrink-0 select-none">❯</span>
                <span className="text-[11px] font-mono text-[#7a7a8a]">
                  subscribe tvt:live --json
                </span>
              </div>

              {/* Output */}
              <pre className="text-[10px] font-mono text-[#adadb8] leading-[1.6] whitespace-pre pl-5 selection:bg-[#00e5b0]/20">
{frameJson}
              </pre>

              {/* Blinking cursor line */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] font-mono text-[#00e5b0] select-none">❯</span>
                <span className="w-[7px] h-[14px] bg-[#00e5b0] animate-pulse" />
              </div>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 h-6 bg-[#111114] border-t border-[#1a1a22]">
              <span className="text-[9px] font-mono text-[#53535f]">
                ably://tvt:live
              </span>
              <span className="text-[9px] font-mono text-[#53535f]">
                {latestFrame ? `type:${frameType}` : "idle"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* FAB buttons */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5">
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className={`w-11 h-11 rounded-full border transition-all flex items-center justify-center shadow-lg shadow-black/30 ${
            panelOpen
              ? "bg-[#00e5b0]/15 border-[#00e5b0]/30 text-[#00e5b0]"
              : "bg-[#26262c] hover:bg-[#2e2e35] border-[#2a2a35] text-[#7a7a8a] hover:text-[#efeff1]"
          }`}
          aria-label="Agent view"
        >
          {panelOpen ? <CloseIcon /> : <TerminalIcon />}
        </button>

        <a
          href="https://x.com/clawcasttv"
          target="_blank"
          rel="noopener noreferrer"
          className="w-11 h-11 rounded-full bg-[#26262c] hover:bg-[#2e2e35] border border-[#2a2a35] text-[#7a7a8a] hover:text-[#efeff1] transition-all flex items-center justify-center shadow-lg shadow-black/30"
          aria-label="Follow on X"
        >
          <XIcon />
        </a>
      </div>
    </>
  )
}
