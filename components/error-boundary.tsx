"use client"

import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from "react-error-boundary"

function Fallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0e0e10] text-[#efeff1] gap-4 p-8">
      <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#E63946]">
        something broke
      </span>
      <p className="text-[14px] font-mono text-[#7a7a8a] text-center max-w-md">
        {message}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="mt-4 px-4 py-2 text-[12px] font-mono text-[#efeff1] bg-[#E63946] hover:bg-[#f05460] transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

export default function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary FallbackComponent={Fallback}>
      {children}
    </ReactErrorBoundary>
  )
}
