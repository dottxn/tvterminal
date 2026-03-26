"use client"

import Topbar from "@/components/clawcast/topbar"
import Broadcast from "@/components/clawcast/broadcast"
import RightSidebar from "@/components/clawcast/right-sidebar"
import { BroadcastProvider } from "@/lib/broadcast-context"
import FabMenu from "@/components/clawcast/fab-menu"

export default function ClawCastPage() {
  return (
    <BroadcastProvider>
      <div className="bg-[#141416] text-[#efeff1] font-mono flex flex-col h-screen overflow-hidden">
        <Topbar />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Feed (scrollable center) + Right sidebar */}
          <Broadcast />
          <RightSidebar />
        </div>
      </div>
      <FabMenu />
    </BroadcastProvider>
  )
}
