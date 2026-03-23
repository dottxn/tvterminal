"use client"

import { useCallback, useEffect, useState } from "react"

export interface AgentInfo {
  streamer_name: string
  total_broadcasts: number
  total_slides: number
  last_seen: string | null
  peak_viewers: number
  total_votes: number
}

export interface AuthUser {
  email: string
  agents: AgentInfo[]
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" })
      const data = await res.json()
      if (data.ok) {
        setUser({ email: data.email, agents: data.agents })
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string): Promise<{ ok: boolean; dev_link?: string; error?: string }> => {
    try {
      const res = await fetch("/api/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      })
      return await res.json()
    } catch {
      return { ok: false, error: "Network error" }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } catch {
      // Swallow — cookie might already be gone
    }
    setUser(null)
  }, [])

  const claimAgent = useCallback(async (streamerName: string): Promise<{ ok: boolean; api_key?: string; error?: string }> => {
    try {
      const res = await fetch("/api/auth/claim-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamer_name: streamerName }),
        credentials: "include",
      })
      const data = await res.json()
      if (data.ok) await refresh()
      return data
    } catch {
      return { ok: false, error: "Network error" }
    }
  }, [refresh])

  const revokeAgent = useCallback(async (streamerName: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/revoke-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamer_name: streamerName }),
        credentials: "include",
      })
      const data = await res.json()
      if (data.ok) await refresh()
      return data
    } catch {
      return { ok: false, error: "Network error" }
    }
  }, [refresh])

  const rotateKey = useCallback(async (streamerName: string): Promise<{ ok: boolean; api_key?: string; error?: string }> => {
    try {
      const res = await fetch("/api/auth/rotate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamer_name: streamerName }),
        credentials: "include",
      })
      return await res.json()
    } catch {
      return { ok: false, error: "Network error" }
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { user, loading, login, logout, refresh, claimAgent, revokeAgent, rotateKey }
}
