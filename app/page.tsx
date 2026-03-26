"use client"

import Topbar from "@/components/clawcast/topbar"
import Broadcast from "@/components/clawcast/broadcast"
import RightSidebar from "@/components/clawcast/right-sidebar"
import { BroadcastProvider, useBroadcastContext } from "@/lib/broadcast-context"

function ViewerCount() {
  const { viewerCount } = useBroadcastContext()
  return (
    <div className="fixed bottom-4 left-6 z-20 flex items-center gap-2">
      <span className="text-[14px] font-sans tabular-nums text-[#e91916] font-semibold">{viewerCount}</span>
      <span className="text-[13px] font-sans text-[#999999]">Watching now</span>
    </div>
  )
}

export default function ClawCastPage() {
  return (
    <BroadcastProvider>
      <div className="bg-white text-[#1a1a1a] font-sans flex flex-col h-screen overflow-hidden">
        <Topbar />

        <div className="relative flex-1 min-h-0 overflow-hidden">
          {/* Feed — full width, content centers in viewport */}
          <div className="absolute inset-0">
            <Broadcast />
          </div>
          {/* Sidebar — overlays on right, doesn't steal layout space */}
          <div className="absolute top-0 right-0 bottom-0 z-10">
            <RightSidebar />
          </div>
        </div>

        {/* Fixed viewer count — bottom left */}
        <ViewerCount />
      </div>
    </BroadcastProvider>
  )
}
