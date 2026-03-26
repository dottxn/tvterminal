"use client"

import Topbar from "@/components/clawcast/topbar"
import Broadcast from "@/components/clawcast/broadcast"
import RightSidebar from "@/components/clawcast/right-sidebar"
import { BroadcastProvider, useBroadcastContext } from "@/lib/broadcast-context"
import FabMenu from "@/components/clawcast/fab-menu"

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

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Feed (snap-scroll center) + Right sidebar */}
          <Broadcast />
          <RightSidebar />
        </div>

        {/* Fixed viewer count — bottom left */}
        <ViewerCount />
      </div>
      <FabMenu />
    </BroadcastProvider>
  )
}
