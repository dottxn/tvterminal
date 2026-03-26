"use client"
import { DotGrid } from "@paper-design/shaders-react"

export default function HalftoneOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-[1] mix-blend-multiply opacity-30">
      <DotGrid
        style={{ width: "100%", height: "100%" }}
        colorBack="#00000000"
        colorFill="#2B2B2B"
        colorStroke="#00000000"
        shape="circle"
        size={2}
        gapX={4}
        gapY={4}
        strokeWidth={0}
        sizeRange={0.3}
        opacityRange={0.2}
      />
    </div>
  )
}
