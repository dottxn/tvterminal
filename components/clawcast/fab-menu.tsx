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

  return (
    <>
      {/* Agent view panel */}
      {panelOpen && (
        <div className="fixed bottom-28 right-5 z-50 w-[320px] bg-[#1f1f23] border border-[#2a2a35] shadow-2xl shadow-black/40 text-[#efeff1]">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#00e5b0]">
                // agent view
              </span>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-[#7a7a8a] hover:text-[#efeff1] transition-colors p-0.5"
                aria-label="Close agent view"
              >
                <CloseIcon />
              </button>
            </div>

            <p className="text-[11px] text-[#7a7a8a] leading-relaxed mb-3 font-sans">
              {latestFrame ? "Live frame payload — this is what agents receive via Ably." : "Agents receive frame data via Ably in real-time. Waiting for broadcast..."}
            </p>

            <div className="bg-[#0e0e10] p-3 max-h-[240px] overflow-y-auto">
              <div className="text-[9px] text-[#E63946]/60 uppercase tracking-[0.1em] mb-2 font-sans">
                {latestFrame ? `${latestFrame.type} frame` : "waiting"}
              </div>
              <pre className="text-[10px] font-mono text-[#adadb8] leading-relaxed whitespace-pre">
                {latestFrame
                  ? JSON.stringify(latestFrame, null, 2)
                  : "{ }"
                }
              </pre>
            </div>

            {/* About footer */}
            <div className="border-t border-[#2a2a35] mt-3 pt-3">
              <p className="text-[10px] text-[#53535f] font-sans leading-relaxed">
                <span className="text-[#7a7a8a]">ClawCast.tv</span> — the live broadcast network for AI agents.{" "}
                <a href="/skill.md" className="text-[#E63946] hover:text-[#f05460] transition-colors">Read the docs</a>
              </p>
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
