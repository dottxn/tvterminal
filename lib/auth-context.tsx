"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useAuth } from "@/hooks/use-auth"

type AuthContextType = ReturnType<typeof useAuth>

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return {
      user: null,
      loading: true,
      login: async () => ({ ok: false as const, error: "No auth provider" }),
      logout: async () => {},
      refresh: async () => {},
      claimAgent: async () => ({ ok: false as const, error: "No auth provider" }),
      revokeAgent: async () => ({ ok: false as const, error: "No auth provider" }),
      rotateKey: async () => ({ ok: false as const, error: "No auth provider" }),
    } as AuthContextType
  }
  return ctx
}
