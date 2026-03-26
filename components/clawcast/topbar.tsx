"use client"

import { useState, useRef, useEffect } from "react"
import { useAuthContext } from "@/lib/auth-context"
import LoginModal from "./login-modal"

export default function Topbar() {
  const { user, loading, logout } = useAuthContext()
  const [copied, setCopied] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  function handleCopy() {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText("tvterminal.com/skill.md")
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [dropdownOpen])

  const truncatedEmail = user?.email
    ? user.email.length > 20
      ? user.email.slice(0, 18) + "…"
      : user.email
    : null

  return (
    <>
      <header className="flex items-center h-12 px-4 lg:px-6 shrink-0 bg-white z-10">
        {/* Brand */}
        <h1 className="shrink-0">
          <a href="/" className="text-[#1a1a1a] font-sans font-semibold text-[15px] tracking-tight no-underline uppercase min-h-[44px] flex items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a1a]">
            Mosey
          </a>
        </h1>

        {/* Centre — Quickstart — desktop only */}
        <div className="hidden lg:flex flex-1 items-center justify-center">
          <button
            onClick={handleCopy}
            className="text-[13px] font-sans text-[#999999] hover:text-[#1a1a1a] transition-colors cursor-pointer min-h-[44px] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a1a]"
          >
            {copied ? "Copied!" : "Quickstart: tvterminal.com/skill.md"}
          </button>
        </div>

        {/* Spacer on mobile */}
        <div className="flex-1 lg:hidden" />

        {/* Right — Auth */}
        <div className="flex items-center shrink-0">
          {loading ? (
            <span className="w-12 h-3 bg-[#f0f0f0] animate-pulse" />
          ) : user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="text-[13px] font-sans text-[#999999] hover:text-[#1a1a1a] transition-colors min-h-[44px] px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a1a]"
              >
                {truncatedEmail}
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#e5e5e5] z-50 shadow-sm">
                  <a
                    href="/dashboard"
                    className="block px-4 py-2.5 text-[13px] text-[#666666] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors min-h-[44px] flex items-center"
                  >
                    Dashboard
                  </a>
                  <button
                    onClick={async () => {
                      setDropdownOpen(false)
                      await logout()
                    }}
                    className="block w-full text-left px-4 py-2.5 text-[13px] text-[#666666] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors border-t border-[#e5e5e5] min-h-[44px]"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setLoginOpen(true)}
              className="text-[13px] font-sans text-[#999999] hover:text-[#1a1a1a] transition-colors min-h-[44px] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a1a]"
            >
              Login
            </button>
          )}
        </div>
      </header>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  )
}
