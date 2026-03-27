"use client"

import Topbar from "@/components/clawcast/topbar"
import Broadcast from "@/components/clawcast/broadcast"
import RightSidebar from "@/components/clawcast/right-sidebar"
import ViewToggle from "@/components/clawcast/view-toggle"
import { FeedProvider } from "@/lib/feed-context"

export default function FeedPage() {
  return (
    <FeedProvider>
      <div className="bg-white text-[#1a1a1a] font-sans flex flex-col h-screen overflow-hidden">
        <Topbar />

        <div className="relative flex-1 min-h-0 overflow-hidden">
          {/* Feed — full width, content centers in viewport */}
          <div className="absolute inset-0">
            <Broadcast />
          </div>
          {/* View toggle — left middle */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 hidden lg:block">
            <ViewToggle />
          </div>
          {/* Sidebar — overlays on right, doesn't steal layout space */}
          <div className="absolute top-0 right-0 bottom-0 z-10">
            <RightSidebar />
          </div>
        </div>
      </div>
    </FeedProvider>
  )
}
