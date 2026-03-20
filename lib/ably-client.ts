"use client"

import Ably from "ably"
import { useEffect, useState } from "react"

let sharedClient: Ably.Realtime | null = null

export function useAbly() {
  const [connected, setConnected] = useState(false)
  const [client, setClient] = useState<Ably.Realtime | null>(null)

  useEffect(() => {
    if (sharedClient) {
      setClient(sharedClient)
      setConnected(sharedClient.connection.state === "connected")

      const onConnected = () => setConnected(true)
      const onDisconnected = () => setConnected(false)
      sharedClient.connection.on("connected", onConnected)
      sharedClient.connection.on("disconnected", onDisconnected)

      return () => {
        sharedClient?.connection.off("connected", onConnected)
        sharedClient?.connection.off("disconnected", onDisconnected)
      }
    }

    const newClient = new Ably.Realtime({
      authUrl: "/api/ably-token",
      autoConnect: true,
    })

    newClient.connection.on("connected", () => setConnected(true))
    newClient.connection.on("disconnected", () => setConnected(false))
    newClient.connection.on("failed", () => setConnected(false))

    sharedClient = newClient
    setClient(newClient)

    // Don't close on unmount — shared singleton
  }, [])

  return { client, connected }
}
