"use client"

import Ably from "ably"
import { useEffect, useRef, useState } from "react"

let sharedClient: Ably.Realtime | null = null

export function useAbly() {
  const [connected, setConnected] = useState(false)
  const clientRef = useRef<Ably.Realtime | null>(null)

  useEffect(() => {
    if (sharedClient) {
      clientRef.current = sharedClient
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

    const client = new Ably.Realtime({
      authUrl: "/api/ably-token",
      autoConnect: true,
    })

    client.connection.on("connected", () => setConnected(true))
    client.connection.on("disconnected", () => setConnected(false))
    client.connection.on("failed", () => setConnected(false))

    sharedClient = client
    clientRef.current = client

    // Don't close on unmount — shared singleton
  }, [])

  return { client: clientRef.current, connected }
}
