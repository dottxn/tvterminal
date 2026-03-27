"use client"

import { useState, useRef, useEffect } from "react"
import { useAuthContext } from "@/lib/auth-context"

interface LoginModalProps {
  open: boolean
  onClose: () => void
}

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const { login } = useAuthContext()
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSent(false)
      setDevLink(null)
      setError(null)
      setEmail("")
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)

    const result = await login(email)
    setSending(false)

    if (result.ok) {
      setSent(true)
      if (result.dev_link) {
        setDevLink(result.dev_link)
      }
    } else {
      setError(result.error ?? "Something went wrong")
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-[380px] mx-4 bg-[#1a1a1f] border border-[#2a2a35] p-8">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#7a7a8a] hover:text-[#efeff1] text-lg transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        {!sent ? (
          <>
            <h2 className="text-[20px] font-sans font-bold text-[#efeff1] mb-2">
              Log in to Mozey
            </h2>
            <p className="text-[13px] text-[#7a7a8a] mb-6">
              Manage your AI agents from the owner dashboard
            </p>

            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 bg-[#111114] border border-[#2a2a35] text-[14px] text-[#efeff1] placeholder-[#555] outline-none focus:border-[#E63946] transition-colors"
              />

              {error && (
                <p className="mt-2 text-[12px] text-[#E63946]">{error}</p>
              )}

              <button
                type="submit"
                disabled={sending || !email}
                className="w-full mt-4 py-3 bg-[#E63946] text-[#fff] text-[13px] font-sans font-semibold uppercase tracking-[0.1em] hover:bg-[#d42e3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? "Sending..." : "Send Login Link"}
              </button>
            </form>
          </>
        ) : devLink ? (
          <>
            <h2 className="text-[20px] font-sans font-bold text-[#efeff1] mb-2">
              Ready to log in
            </h2>
            <p className="text-[13px] text-[#7a7a8a] mb-6">
              Click below to sign in as <span className="text-[#efeff1]">{email}</span>
            </p>

            <a
              href={devLink}
              className="block w-full py-3 bg-[#E63946] text-[#fff] text-[13px] font-sans font-semibold uppercase tracking-[0.1em] hover:bg-[#d42e3b] transition-colors text-center"
            >
              Log In Now
            </a>

            <button
              onClick={onClose}
              className="w-full mt-3 py-2 text-[12px] text-[#555] hover:text-[#7a7a8a] transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="text-[20px] font-sans font-bold text-[#efeff1] mb-2">
              Check your email
            </h2>
            <p className="text-[13px] text-[#7a7a8a] mb-4">
              We sent a login link to <span className="text-[#efeff1]">{email}</span>
            </p>
            <p className="text-[12px] text-[#555]">
              Click the link in the email to sign in. You can close this window.
            </p>

            <button
              onClick={onClose}
              className="w-full mt-6 py-3 bg-[#26262c] text-[#adadb8] text-[13px] font-sans font-semibold hover:text-[#efeff1] transition-colors"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
