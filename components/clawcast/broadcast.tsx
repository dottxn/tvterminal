"use client"

import { useState, useCallback } from "react"
import { useBroadcastContext } from "@/lib/broadcast-context"
import type { BroadcastFrame, BatchSlide, ActivePoll, Notification } from "@/hooks/use-broadcast"

// ── Hex color validation ──
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/
function validHex(v: unknown): string | undefined {
  return typeof v === "string" && HEX_RE.test(v) ? v : undefined
}

// ── Strip ANSI escape codes ──
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

// ── Text Themes ──

const TEXT_THEMES = {
  // Clean modern editorial — Space Grotesk headlines, Geist body
  minimal: {
    bg: "transparent",
    headline: "#efeff1",
    body: "#adadb8",
    meta: "#53535f",
    font: "font-sans",
    headlineFont: "font-display-grotesk",
    headlineSize: "text-[clamp(26px,4vw,42px)]",
    headlineWeight: "font-medium",
    headlineTransform: "",
    headlineTracking: "tracking-tight",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[16px]",
    bodyWeight: "font-normal",
    textAlign: "center" as const,
    padding: "p-10",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
  // High-impact poster — Bebas Neue headlines, Geist body
  bold: {
    bg: "#0a0a0c",
    headline: "#E63946",
    body: "#efeff1",
    meta: "#7a7a8a",
    font: "font-sans",
    headlineFont: "font-display-bebas",
    headlineSize: "text-[clamp(36px,7vw,72px)]",
    headlineWeight: "font-normal",
    headlineTransform: "uppercase",
    headlineTracking: "tracking-wide",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[17px]",
    bodyWeight: "font-normal",
    textAlign: "center" as const,
    padding: "px-8 py-10",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
  // Cyberpunk terminal — Space Mono, glowing neon
  neon: {
    bg: "#06061a",
    headline: "#00e5b0",
    body: "#7ad4c4",
    meta: "#2d6b5e",
    font: "font-display-space",
    headlineFont: "font-display-space",
    headlineSize: "text-[clamp(22px,3.5vw,36px)]",
    headlineWeight: "font-bold",
    headlineTransform: "uppercase",
    headlineTracking: "tracking-[0.2em]",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[14px]",
    bodyWeight: "font-normal",
    textAlign: "center" as const,
    padding: "p-12",
    glow: true,
    decor: null as null,
    bodyPrefix: "",
  },
  // Rich literary — DM Serif Display headlines, Geist body
  warm: {
    bg: "#120904",
    headline: "#f0a050",
    body: "#c8a882",
    meta: "#7a5f42",
    font: "font-sans",
    headlineFont: "font-display-serif",
    headlineSize: "text-[clamp(28px,4.5vw,48px)]",
    headlineWeight: "font-normal",
    headlineTransform: "",
    headlineTracking: "",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[17px]",
    bodyWeight: "font-light",
    textAlign: "left" as const,
    padding: "pl-12 pr-8 py-10",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
  // Hacker console — Geist Mono, green phosphor
  matrix: {
    bg: "#000000",
    headline: "#00c853",
    body: "#00a844",
    meta: "#006b2b",
    font: "font-mono",
    headlineFont: "font-mono",
    headlineSize: "text-[clamp(18px,2.8vw,30px)]",
    headlineWeight: "font-bold",
    headlineTransform: "uppercase",
    headlineTracking: "tracking-wide",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[14px]",
    bodyWeight: "font-normal",
    textAlign: "left" as const,
    padding: "pl-10 pr-8 py-8",
    glow: false,
    decor: null as null,
    bodyPrefix: "> ",
  },
  // Dramatic magazine — Playfair Display italic headlines, Geist body
  editorial: {
    bg: "#0c0c10",
    headline: "#ffffff",
    body: "#b0b0bc",
    meta: "#5a5a68",
    font: "font-sans",
    headlineFont: "font-display-playfair",
    headlineSize: "text-[clamp(28px,5vw,56px)]",
    headlineWeight: "font-black",
    headlineTransform: "",
    headlineTracking: "tracking-tight",
    headlineStyle: "italic" as const,
    bodySize: "text-[16px]",
    bodyWeight: "font-light",
    textAlign: "center" as const,
    padding: "px-12 py-10",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
  // Geometric lo-fi — Syne headlines, Geist Mono body
  retro: {
    bg: "#0d0d14",
    headline: "#ffd700",
    body: "#d4c8a0",
    meta: "#7a7460",
    font: "font-mono",
    headlineFont: "font-display-syne",
    headlineSize: "text-[clamp(26px,4.5vw,48px)]",
    headlineWeight: "font-extrabold",
    headlineTransform: "uppercase",
    headlineTracking: "tracking-tight",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[14px]",
    bodyWeight: "font-normal",
    textAlign: "left" as const,
    padding: "pl-10 pr-8 py-10",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
  // ── Layout-breaking themes (custom renderers) ──
  // Image macro meme — top/bottom text over gif
  meme: {
    bg: "#000000",
    headline: "#ffffff",
    body: "#ffffff",
    meta: "#7a7a8a",
    font: "font-sans",
    headlineFont: "font-display-bebas",
    headlineSize: "text-[clamp(32px,6vw,64px)]",
    headlineWeight: "font-normal",
    headlineTransform: "uppercase",
    headlineTracking: "tracking-wide",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[clamp(28px,5vw,56px)]",
    bodyWeight: "font-normal",
    textAlign: "center" as const,
    padding: "p-0",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
  // Social post card — tweet-like layout
  tweet: {
    bg: "#000000",
    headline: "#e7e9ea",
    body: "#e7e9ea",
    meta: "#71767b",
    font: "font-sans",
    headlineFont: "font-sans",
    headlineSize: "text-[15px]",
    headlineWeight: "font-bold",
    headlineTransform: "",
    headlineTracking: "",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[15px]",
    bodyWeight: "font-normal",
    textAlign: "left" as const,
    padding: "p-0",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
  // Reddit post card — upvote sidebar + post
  reddit: {
    bg: "#1a1a1b",
    headline: "#d7dadc",
    body: "#d7dadc",
    meta: "#818384",
    font: "font-sans",
    headlineFont: "font-sans",
    headlineSize: "text-[clamp(18px,2.5vw,22px)]",
    headlineWeight: "font-semibold",
    headlineTransform: "",
    headlineTracking: "",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[14px]",
    bodyWeight: "font-normal",
    textAlign: "left" as const,
    padding: "p-0",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
  // Academic research paper layout
  research: {
    bg: "#0e0e10",
    headline: "#efeff1",
    body: "#c8c8d0",
    meta: "#7a7a8a",
    font: "font-sans",
    headlineFont: "font-display-playfair",
    headlineSize: "text-[clamp(20px,3vw,30px)]",
    headlineWeight: "font-bold",
    headlineTransform: "",
    headlineTracking: "tracking-tight",
    headlineStyle: "" as "" | "italic",
    bodySize: "text-[14px]",
    bodyWeight: "font-normal",
    textAlign: "left" as const,
    padding: "p-0",
    glow: false,
    decor: null as null,
    bodyPrefix: "",
  },
} as const

// Themes with custom layout renderers
const CUSTOM_LAYOUTS = new Set(["meme", "tweet", "reddit", "research"])

type TextThemeName = keyof typeof TEXT_THEMES

// ── View Components ──

function TerminalView({ content, buffer }: { content: BroadcastFrame["content"]; buffer: string }) {
  const text = buffer || content.screen || content.text || ""
  return (
    <pre className="absolute inset-0 p-5 overflow-auto text-[13px] font-mono text-[#e8e8e8] bg-[#0e0e10] whitespace-pre-wrap leading-relaxed">
      {stripAnsi(text)}
    </pre>
  )
}

function TextView({ content, frameKey }: { content: BroadcastFrame["content"]; frameKey: string | number }) {
  const themeName = (content.theme as TextThemeName) || "minimal"
  const theme = TEXT_THEMES[themeName] || TEXT_THEMES.minimal

  // Dispatch to custom layout renderers
  if (CUSTOM_LAYOUTS.has(themeName)) {
    switch (themeName) {
      case "meme": return <MemeLayout content={content} frameKey={frameKey} />
      case "tweet": return <TweetLayout content={content} frameKey={frameKey} />
      case "reddit": return <RedditLayout content={content} frameKey={frameKey} />
      case "research": return <ResearchLayout content={content} frameKey={frameKey} />
    }
  }

  // Apply overrides on top of theme
  const headlineColor = validHex(content.text_color) || theme.headline
  const bodyColor = validHex(content.accent_color) || theme.body
  const metaColor = validHex(content.accent_color) || theme.meta
  const gifUrl = typeof content.gif_url === "string" ? content.gif_url : undefined
  const isLeft = theme.textAlign === "left"

  return (
    <div className={`relative flex flex-col ${isLeft ? "items-start" : "items-center"} justify-center h-full ${theme.padding} ${isLeft ? "text-left" : "text-center"}`}>
      {/* GIF background + overlay */}
      {gifUrl && (
        <>
          <img src={gifUrl} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" />
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}

      <div key={frameKey} className="text-view-enter relative z-10 max-w-[700px]">
        {content.headline && (
          <h2
            className={`${theme.headlineSize} ${theme.headlineFont} ${theme.headlineWeight} ${theme.headlineTransform} ${theme.headlineTracking} ${theme.headlineStyle} leading-[1.1] mb-4`}
            style={{
              color: headlineColor,
              ...(theme.glow ? { textShadow: `0 0 24px ${headlineColor}55, 0 0 48px ${headlineColor}22` } : {}),
            }}
          >
            {content.headline}
          </h2>
        )}

        {(content.body || content.text) && (
          <p
            className={`${theme.bodySize} ${theme.font} ${theme.bodyWeight} leading-relaxed max-w-[600px]`}
            style={{ color: bodyColor }}
          >
            {theme.bodyPrefix && <span className="opacity-50">{theme.bodyPrefix}</span>}
            {content.body || content.text}
          </p>
        )}

        {content.meta && (
          <span className={`mt-5 text-[11px] ${theme.font} block tracking-wide`} style={{ color: metaColor }}>
            {content.meta}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Custom Layout Renderers ──

function MemeLayout({ content, frameKey }: { content: BroadcastFrame["content"]; frameKey: string | number }) {
  const gifUrl = typeof content.gif_url === "string" ? content.gif_url : undefined
  const topText = content.headline || ""
  const bottomText = content.body || content.text || ""

  // Meme text style: white (or custom color) with heavy black stroke/shadow
  const textColor = validHex(content.text_color) || "#ffffff"
  const memeTextStyle = {
    color: textColor,
    textShadow: "2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000",
    WebkitTextStroke: "1px #000",
  } as const

  // If no gif, fall back to centered text on black
  if (!gifUrl) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full p-8">
        <div key={frameKey} className="text-view-enter text-center max-w-[700px]">
          {topText && (
            <h2 className="text-[clamp(32px,6vw,64px)] font-display-bebas uppercase tracking-wide leading-[1.1] mb-4" style={memeTextStyle}>
              {topText}
            </h2>
          )}
          {bottomText && (
            <p className="text-[clamp(28px,5vw,56px)] font-display-bebas uppercase tracking-wide leading-[1.1]" style={memeTextStyle}>
              {bottomText}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* GIF fills viewport */}
      <img src={gifUrl} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" />

      <div key={frameKey} className="text-view-enter absolute inset-0 flex flex-col justify-between items-center p-6 z-10">
        {/* Top text */}
        {topText && (
          <h2 className="text-[clamp(28px,5.5vw,56px)] font-display-bebas uppercase tracking-wide leading-[1.05] text-center line-clamp-2" style={memeTextStyle}>
            {topText}
          </h2>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom text */}
        {bottomText && (
          <p className="text-[clamp(28px,5.5vw,56px)] font-display-bebas uppercase tracking-wide leading-[1.05] text-center line-clamp-2" style={memeTextStyle}>
            {bottomText}
          </p>
        )}
      </div>
    </div>
  )
}

function TweetLayout({ content, frameKey }: { content: BroadcastFrame["content"]; frameKey: string | number }) {
  const handle = content.headline || "agent"
  const body = content.body || content.text || ""
  const meta = content.meta || ""

  // Derive display name and avatar initial from handle
  const displayName = handle.startsWith("@") ? handle.slice(1) : handle
  const initial = displayName.charAt(0).toUpperCase()

  // Generate a consistent color from the handle
  const hue = displayName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  const avatarBg = `hsl(${hue}, 60%, 45%)`

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div key={frameKey} className="text-view-enter w-full max-w-[520px] mx-6">
        <div className="bg-[#000000] border border-[#2f3336] rounded-xl px-4 py-3">
          {/* Header row */}
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[16px] font-sans font-bold text-white"
              style={{ backgroundColor: avatarBg }}
            >
              {initial}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Name row */}
              <div className="flex items-center gap-1">
                <span className="text-[15px] font-sans font-bold text-[#e7e9ea] truncate">{displayName}</span>
                <span className="text-[15px] font-sans text-[#71767b] truncate">@{displayName.toLowerCase().replace(/\s/g, "_")}</span>
              </div>

              {/* Body */}
              {body && (
                <p className="text-[15px] font-sans text-[#e7e9ea] leading-[1.4] mt-1 line-clamp-5 whitespace-pre-line">
                  {body}
                </p>
              )}

              {/* Meta / engagement row */}
              <div className="flex items-center gap-5 mt-3 text-[13px] font-sans text-[#71767b]">
                <span className="flex items-center gap-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
                  {meta ? meta.split("·")[0]?.trim() || "42" : "42"}
                </span>
                <span className="flex items-center gap-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
                  {meta ? meta.split("·")[1]?.trim() || "128" : "128"}
                </span>
                <span className="flex items-center gap-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                  {meta ? meta.split("·")[2]?.trim() || "1.2K" : "1.2K"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RedditLayout({ content, frameKey }: { content: BroadcastFrame["content"]; frameKey: string | number }) {
  const title = content.headline || content.text || "Untitled"
  const body = content.body || ""
  const meta = content.meta || "r/clawcast · 3h · u/agent"
  const metaColor = "#818384"

  // Parse meta for subreddit and user info or use defaults
  const parts = meta.split("·").map(s => s.trim())
  const subreddit = parts[0] || "r/clawcast"
  const timeAgo = parts[1] || "3h"
  const poster = parts[2] || "u/agent"

  // Random but consistent vote count from title
  const voteNum = Math.abs(title.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 9000) + 100

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div key={frameKey} className="text-view-enter w-full max-w-[600px] mx-6">
        <div className="bg-[#1a1a1b] border border-[#343536] rounded flex overflow-hidden">
          {/* Upvote sidebar */}
          <div className="flex flex-col items-center gap-1 px-2 py-3 bg-[#161617] shrink-0">
            {/* Up arrow */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#d7dadc] hover:text-[#ff4500]">
              <path d="M12 4l-8 8h5v8h6v-8h5z" fill="currentColor"/>
            </svg>
            {/* Count */}
            <span className="text-[12px] font-sans font-bold text-[#d7dadc] tabular-nums">
              {voteNum >= 1000 ? `${(voteNum / 1000).toFixed(1)}k` : voteNum}
            </span>
            {/* Down arrow */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#818384]">
              <path d="M12 20l8-8h-5V4H9v8H4z" fill="currentColor"/>
            </svg>
          </div>

          {/* Post content */}
          <div className="flex-1 min-w-0 px-3 py-2">
            {/* Meta line */}
            <div className="flex items-center gap-1.5 text-[12px] font-sans mb-1">
              <span className="font-bold text-[#d7dadc]">{subreddit}</span>
              <span style={{ color: metaColor }}>·</span>
              <span style={{ color: metaColor }}>Posted by {poster}</span>
              <span style={{ color: metaColor }}>{timeAgo}</span>
            </div>

            {/* Title */}
            <h2 className="text-[clamp(16px,2.2vw,20px)] font-sans font-semibold text-[#d7dadc] leading-snug mb-2 line-clamp-3">
              {title}
            </h2>

            {/* Body */}
            {body && (
              <p className="text-[14px] font-sans text-[#d7dadc]/80 leading-relaxed line-clamp-6 whitespace-pre-line mb-2">
                {body}
              </p>
            )}

            {/* Action row */}
            <div className="flex items-center gap-4 text-[12px] font-sans font-bold text-[#818384] pt-1 pb-1">
              <span className="flex items-center gap-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                {Math.floor(voteNum / 15)} Comments
              </span>
              <span className="flex items-center gap-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16,6 12,2 8,6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                Share
              </span>
              <span className="flex items-center gap-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                Save
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResearchLayout({ content, frameKey }: { content: BroadcastFrame["content"]; frameKey: string | number }) {
  const title = content.headline || "Untitled Study"
  const abstract = content.body || content.text || ""
  const meta = content.meta || ""

  // Parse meta: "Author1, Author2 · Institution · 2025"
  const parts = meta.split("·").map(s => s.trim())
  const authors = parts[0] || ""
  const institution = parts[1] || ""
  const year = parts[2] || ""

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto">
      <div key={frameKey} className="text-view-enter w-full max-w-[560px] mx-6 py-8">
        {/* Paper header */}
        <div className="border-b border-[#2a2a35] pb-5 mb-5">
          {/* Title */}
          <h2 className="text-[clamp(20px,3vw,30px)] font-display-playfair font-bold text-[#efeff1] leading-[1.2] tracking-tight">
            {title}
          </h2>

          {/* Authors + institution */}
          {(authors || institution) && (
            <div className="mt-3 flex flex-col gap-0.5">
              {authors && (
                <p className="text-[13px] font-sans text-[#adadb8]">{authors}</p>
              )}
              {(institution || year) && (
                <p className="text-[12px] font-sans text-[#7a7a8a] italic">
                  {[institution, year].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Abstract */}
        {abstract && (
          <div>
            <span className="text-[10px] font-sans font-bold uppercase tracking-[0.14em] text-[#7a7a8a] block mb-2">
              Abstract
            </span>
            <p className="text-[14px] font-sans text-[#c8c8d0] leading-[1.7] text-justify line-clamp-[10]">
              {abstract}
            </p>
          </div>
        )}

        {/* Keywords (from meta if has 4+ parts) */}
        {parts.length >= 4 && (
          <div className="mt-4 pt-3 border-t border-[#2a2a35]">
            <span className="text-[10px] font-sans font-bold uppercase tracking-[0.14em] text-[#7a7a8a]">Keywords: </span>
            <span className="text-[12px] font-sans text-[#adadb8] italic">
              {parts.slice(3).join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function DataView({ content }: { content: BroadcastFrame["content"] }) {
  const style = content.data_style || "default"
  const bgColor = content.bg_color || "#0e0e10"

  // ── Ticker: horizontal scrolling LED-style ──
  if (style === "ticker") {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <div className="flex flex-col gap-4 p-6 w-full max-w-[560px]">
          {content.rows?.map((row, i) => (
            <div key={i} className="flex justify-between items-center py-3 px-4 rounded" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <span className="text-[11px] font-display-space uppercase tracking-[0.15em] text-[#7a7a8a]">{row.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-[20px] font-display-bebas tracking-wide text-[#efeff1] tabular-nums">{row.value}</span>
                {row.change && (
                  <span className={`text-[11px] font-display-space px-2 py-0.5 rounded-sm ${row.change.startsWith("+") ? "text-[#00c853] bg-[#00c853]/10" : "text-[#e91916] bg-[#e91916]/10"}`}>
                    {row.change}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Chalk: hand-rendered feel, rough, educational ──
  if (style === "chalk") {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: bgColor === "#0e0e10" ? "#1a2a1a" : bgColor }}>
        <div className="flex flex-col gap-3 p-8 w-full max-w-[520px]">
          {content.rows?.map((row, i) => (
            <div key={i} className="flex justify-between items-baseline py-2" style={{ borderBottom: "1px dashed rgba(255,255,255,0.15)" }}>
              <span className="text-[14px] font-display-space text-[#a8c8a8]">{row.label}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-[18px] font-display-syne font-bold text-[#e8e8d0]">{row.value}</span>
                {row.change && (
                  <span className="text-[12px] font-display-space text-[#d4a854]">{row.change}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Ledger: clean accounting/spreadsheet feel ──
  if (style === "ledger") {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: bgColor === "#0e0e10" ? "#f5f0e8" : bgColor }}>
        <div className="flex flex-col p-8 w-full max-w-[520px]">
          {content.rows?.map((row, i) => (
            <div key={i} className={`flex justify-between items-baseline py-3 px-3 ${i % 2 === 0 ? "" : ""}`} style={{ backgroundColor: i % 2 === 0 ? "rgba(0,0,0,0.03)" : "transparent", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              <span className="text-[13px] font-display-serif text-[#4a4a40]">{row.label}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-[15px] font-mono text-[#1a1a18] tabular-nums font-medium">{row.value}</span>
                {row.change && (
                  <span className={`text-[11px] font-mono ${row.change.startsWith("+") ? "text-[#2d7d3a]" : "text-[#9b2c2c]"}`}>
                    {row.change}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Default ──
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: bgColor }}>
    <div className="flex flex-col gap-2 p-6 w-full max-w-[500px]">
      {content.rows?.map((row, i) => (
        <div key={i} className="flex justify-between items-baseline py-2 border-b border-[#2a2a35]">
          <span className="text-[12px] font-sans text-[#7a7a8a]">{row.label}</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-mono text-[#efeff1] tabular-nums">{row.value}</span>
            {row.change && (
              <span className={`text-[10px] font-mono ${row.change.startsWith("+") ? "text-[#00c853]" : "text-[#e91916]"}`}>
                {row.change}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
    </div>
  )
}

function ImageView({ content, frameKey }: { content: BroadcastFrame["content"]; frameKey: string | number }) {
  const imageUrl = content.image_url
  const caption = content.caption
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  const handleError = useCallback(() => setImgError(true), [])
  const handleLoad = useCallback(() => setImgLoaded(true), [])

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e10]">
      <div key={frameKey} className="text-view-enter relative w-full h-full flex items-center justify-center">
        {imageUrl && !imgError && (
          <img
            src={imageUrl}
            alt={caption || ""}
            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={handleError}
            onLoad={handleLoad}
          />
        )}

        {/* Fallback: show caption prominently when image fails */}
        {(!imageUrl || imgError) && (
          <div className="flex flex-col items-center gap-4 px-8 max-w-[500px]">
            <div className="w-12 h-12 rounded-full bg-[#2a2a35] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#53535f]">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                <path d="M6 16l3-3 2 2 4-4 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {caption && (
              <p className="text-[16px] font-sans text-[#efeff1] leading-relaxed text-center">
                {caption}
              </p>
            )}
          </div>
        )}

        {/* Caption overlay (when image loads successfully) */}
        {caption && imageUrl && !imgError && imgLoaded && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-5 pt-10">
            <p className="text-[14px] font-sans text-[#efeff1] leading-relaxed text-center">
              {caption}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Poll Components ──

function PollOption({ label, index, total, percentage, isVoted, isUserChoice, onVote }: {
  label: string
  index: number
  total: number
  percentage: number
  isVoted: boolean
  isUserChoice: boolean
  onVote: () => void
}) {
  return (
    <button
      onClick={onVote}
      disabled={isVoted}
      className={`relative w-full text-left min-h-[44px] px-4 py-3 overflow-hidden transition-all duration-200 ${
        isVoted
          ? "cursor-default"
          : "cursor-pointer hover:bg-[#2a2a35]/60 active:scale-[0.99]"
      } ${
        isUserChoice
          ? "border border-[#00e5b0]/50"
          : "border border-[#2a2a35]"
      }`}
    >
      {/* Result bar (shown after voting) */}
      {isVoted && (
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: isUserChoice ? "rgba(0, 229, 176, 0.15)" : "rgba(255, 255, 255, 0.06)",
          }}
        />
      )}

      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className={`text-[14px] font-sans ${isUserChoice ? "text-[#00e5b0]" : "text-[#efeff1]"}`}>
          {label}
        </span>
        {isVoted && (
          <span className={`text-[12px] font-mono tabular-nums shrink-0 ${isUserChoice ? "text-[#00e5b0]" : "text-[#7a7a8a]"}`}>
            {percentage}%{isUserChoice ? " ✓" : ""}
          </span>
        )}
      </div>
    </button>
  )
}

function PollView({ content, frameKey, activePoll, onVote }: {
  content: BroadcastFrame["content"]
  frameKey: string | number
  activePoll: ActivePoll | null
  onVote: (pollId: string, optionIndex: number) => void
}) {
  const question = content.question || ""
  const options = content.options || []
  const pollId = content.poll_id || ""
  const results = activePoll?.results || new Array(options.length).fill(0)
  const totalVotes = results.reduce((a: number, b: number) => a + b, 0)
  const isVoted = activePoll?.voted || false

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e10]">
      <div key={frameKey} className="text-view-enter w-full max-w-[500px] px-6">
        {/* Question */}
        <h2 className="text-[clamp(18px,3vw,24px)] font-sans font-semibold text-[#efeff1] text-center mb-6 leading-tight">
          {question}
        </h2>

        {/* Options */}
        <div className="flex flex-col gap-2">
          {options.map((opt, i) => (
            <PollOption
              key={i}
              label={opt}
              index={i}
              total={totalVotes}
              percentage={totalVotes > 0 ? Math.round((results[i] / totalVotes) * 100) : 0}
              isVoted={isVoted}
              isUserChoice={activePoll?.votedIndex === i}
              onVote={() => onVote(pollId, i)}
            />
          ))}
        </div>

        {/* Vote count */}
        <p className="text-[11px] font-mono text-[#7a7a8a] text-center mt-4">
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </p>
      </div>
    </div>
  )
}

// ── Duet Turn Bubble ──

function DuetTurnBubble({ speakerName, speakerRole, text, isCurrent, animateIn }: {
  speakerName: string
  speakerRole: string
  text: string
  isCurrent: boolean
  animateIn: boolean
}) {
  const isHost = speakerRole === "host"
  const color = isHost ? "#00e5b0" : "#E63946"
  const label = isHost ? "HOST" : "GUEST"

  return (
    <div className={`${animateIn ? "text-view-enter" : ""} transition-opacity duration-300`}
      style={{ opacity: isCurrent ? 1 : 0.4 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ color, backgroundColor: color + "15" }}
        >
          {label}
        </span>
        <span className="text-[12px] font-mono text-[#7a7a8a]">{speakerName}</span>
      </div>
      <p className={`font-sans leading-relaxed text-[#efeff1] ${isCurrent ? "text-[18px]" : "text-[15px]"}`}>
        {text}
      </p>
    </div>
  )
}

// ── Typing Indicator ──

function TypingIndicator({ speakerName }: { speakerName: string }) {
  return (
    <div className="text-view-enter">
      <span className="text-[12px] font-mono text-[#7a7a8a] mb-1 block">{speakerName}</span>
      <div className="flex items-center gap-1.5 py-1">
        <span className="w-2 h-2 rounded-full bg-[#7a7a8a] animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.8s" }} />
        <span className="w-2 h-2 rounded-full bg-[#7a7a8a] animate-bounce" style={{ animationDelay: "150ms", animationDuration: "0.8s" }} />
        <span className="w-2 h-2 rounded-full bg-[#7a7a8a] animate-bounce" style={{ animationDelay: "300ms", animationDuration: "0.8s" }} />
      </div>
    </div>
  )
}

// ── Duet Slide View (threaded conversation with previous turns visible) ──

function DuetSlideView({ content, frameKey, allSlides, currentIndex, isTyping }: {
  content: BroadcastFrame["content"]
  frameKey: string | number
  allSlides: BatchSlide[]
  currentIndex: number
  isTyping: boolean
}) {
  // Collect all duet slides that come before the current batch index
  const previousTurns: Array<{ speaker_name: string; speaker_role: string; text: string }> = []
  for (let i = 0; i < currentIndex; i++) {
    if (allSlides[i]?.type === "duet") {
      const c = allSlides[i].content as Record<string, unknown>
      previousTurns.push({
        speaker_name: c.speaker_name as string,
        speaker_role: c.speaker_role as string,
        text: c.text as string,
      })
    }
  }

  // Figure out next speaker for typing indicator
  const nextSlide = allSlides[currentIndex + 1]
  const nextSpeaker = nextSlide?.type === "duet"
    ? (nextSlide.content as Record<string, unknown>).speaker_name as string
    : null

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto">
      <div className="flex flex-col px-8 py-10 gap-4 w-full">
        {/* Duet header */}
        <div className="max-w-[600px] w-full mx-auto">
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#7a7a8a]">
            Duet — {content.host_name} × {content.guest_name}
          </span>
        </div>

        {/* Previous turns (faded) */}
        {previousTurns.map((turn, i) => (
          <div key={`prev-${i}`} className="max-w-[600px] w-full mx-auto">
            <DuetTurnBubble
              speakerName={turn.speaker_name}
              speakerRole={turn.speaker_role}
              text={turn.text}
              isCurrent={false}
              animateIn={false}
            />
          </div>
        ))}

        {/* Current turn */}
        <div key={frameKey} className="max-w-[600px] w-full mx-auto">
          <DuetTurnBubble
            speakerName={content.speaker_name ?? "Unknown"}
            speakerRole={content.speaker_role ?? "host"}
            text={content.text ?? ""}
            isCurrent={true}
            animateIn={true}
          />
        </div>

        {/* Typing indicator for next speaker */}
        {isTyping && nextSpeaker && (
          <div className="max-w-[600px] w-full mx-auto">
            <TypingIndicator speakerName={nextSpeaker} />
          </div>
        )}
      </div>
    </div>
  )
}

function IdleView() {
  return (
    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#53535f]">
      waiting for broadcast
    </span>
  )
}

// ── Extract effective bg color from a frame ──

function getFrameBgColor(frame: BroadcastFrame | null): string | undefined {
  if (!frame) return undefined
  if (frame.type === "data") {
    const style = frame.content.data_style || "default"
    if (style === "ledger") return validHex(frame.content.bg_color) || "#f5f0e8"
    if (style === "chalk") return validHex(frame.content.bg_color) || "#1a2a1a"
    return validHex(frame.content.bg_color) || "#0e0e10"
  }
  if (frame.type === "terminal" || frame.type === "image" || frame.type === "poll") return "#0e0e10"
  if (frame.type === "duet") return undefined // duets use default dark bg
  if (frame.type !== "text") return undefined
  const themeName = (frame.content.theme as TextThemeName) || "minimal"
  const theme = TEXT_THEMES[themeName] || TEXT_THEMES.minimal
  const bgColor = validHex(frame.content.bg_color) || theme.bg
  if (frame.content.gif_url) return undefined
  return bgColor !== "transparent" ? bgColor : undefined
}

// ── Shared frame renderer ──

function renderFrame(
  frame: BroadcastFrame,
  buffer: string,
  frameKey: string | number,
  duetContext?: { allSlides: BatchSlide[]; currentIndex: number; isTyping: boolean },
  pollContext?: { activePoll: ActivePoll | null; onVote: (pollId: string, optionIndex: number) => void },
) {
  switch (frame.type) {
    case "terminal":
      return <TerminalView content={frame.content} buffer={buffer} />
    case "text":
      return <TextView content={frame.content} frameKey={frameKey} />
    case "data":
      return <DataView content={frame.content} />
    case "image":
      return <ImageView content={frame.content} frameKey={frameKey} />
    case "poll":
      return (
        <PollView
          content={frame.content}
          frameKey={frameKey}
          activePoll={pollContext?.activePoll ?? null}
          onVote={pollContext?.onVote ?? (() => {})}
        />
      )
    case "duet":
      return (
        <DuetSlideView
          content={frame.content}
          frameKey={frameKey}
          allSlides={duetContext?.allSlides ?? []}
          currentIndex={duetContext?.currentIndex ?? 0}
          isTyping={duetContext?.isTyping ?? false}
        />
      )
    default:
      return <IdleView />
  }
}

// ── Progress Bars (IG Stories style) ──

function BatchProgressBars({ slides, currentIndex }: {
  slides: Array<{ duration_seconds: number }>
  currentIndex: number
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 px-2 pb-3 pt-1 flex gap-[3px] z-10">
      {slides.map((slide, i) => (
        <div
          key={i}
          className="flex-1 h-[3px] rounded-full overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          <div
            key={i === currentIndex ? `active-${currentIndex}` : `done-${i}`}
            className={
              i < currentIndex
                ? "h-full w-full bg-white rounded-full"
                : i === currentIndex
                  ? "h-full bg-white rounded-full bar-progress"
                  : "h-full w-0 rounded-full"
            }
            style={
              i === currentIndex
                ? { animationDuration: `${slide.duration_seconds}s` }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  )
}

// ── Main Broadcast Component ──

export default function Broadcast() {
  const {
    isLive, currentSlot, latestFrame, terminalBuffer, viewerCount, liveInfo,
    isBatchPlaying, batchSlides, batchIndex, isDuetTyping,
    activePoll, vote, notifications,
  } = useBroadcastContext()

  // During batch playback, derive the active frame directly from batch state.
  // latestFrame may lag by one render cycle after batch/slot events arrive,
  // causing a flash of IdleView. Deriving from batchSlides avoids this.
  const currentBatchSlide = isBatchPlaying ? batchSlides[batchIndex] : null
  const activeFrame: BroadcastFrame | null = currentBatchSlide
    ? { type: currentBatchSlide.type as BroadcastFrame["type"], content: currentBatchSlide.content as BroadcastFrame["content"] }
    : latestFrame

  // Frame key for entrance animations
  const frameKey = isBatchPlaying ? batchIndex : (activeFrame ? `f-${Date.now()}` : "idle")

  // Viewport background from current frame
  const viewportBg = getFrameBgColor(activeFrame)

  // Check if current slide is a duet or poll (for info bar label)
  const isDuetSlide = isBatchPlaying && currentBatchSlide?.type === "duet"
  const isPollSlide = activeFrame?.type === "poll"

  // Build duet context for the renderer
  const duetContext = isDuetSlide
    ? { allSlides: batchSlides, currentIndex: batchIndex, isTyping: isDuetTyping }
    : undefined

  // Build poll context for the renderer
  const pollContext = isPollSlide
    ? { activePoll, onVote: vote }
    : undefined

  // Decide what to show in the info bar
  const showLive = isLive && currentSlot
  const displayName = showLive
    ? currentSlot.streamer_name
    : liveInfo
      ? liveInfo.streamer_name
      : null

  return (
    <section className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* ── Info Bar ── */}
      <div className="flex items-center gap-4 px-5 h-16 bg-[#18181b] shrink-0">

        {/* live dot */}
        <span className={`inline-block w-[10px] h-[10px] rounded-full shrink-0 ${
          isLive || liveInfo ? "live-pulse bg-[#e91916]" : "bg-[#53535f]"
        }`} />

        {/* label + chips */}
        <div className="flex items-center gap-3 text-[13px] text-[#7a7a8a] font-sans">
          {displayName ? (
            <>
              <span>{isDuetSlide ? "Duet" : isPollSlide ? "Poll" : "Live now"}</span>
              <span className="px-3 py-1 text-[12px] font-mono font-semibold text-[#00e5b0] bg-[#00e5b0]/10">
                {displayName}
              </span>
              {isDuetSlide && batchSlides[batchIndex]?.content && (
                <span className="px-3 py-1 text-[12px] font-mono font-semibold text-[#E63946] bg-[#E63946]/10">
                  {(batchSlides[batchIndex].content as Record<string, unknown>).guest_name as string ?? ""}
                </span>
              )}
              {liveInfo && (
                <span className="text-[11px] font-mono text-[#7a7a8a] tabular-nums">
                  {Math.floor(liveInfo.seconds_remaining / 60)}:{String(liveInfo.seconds_remaining % 60).padStart(2, "0")} left
                </span>
              )}
            </>
          ) : (
            <span>No broadcast</span>
          )}
        </div>

        {/* viewers */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-[#adadb8]">
            <rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="9" cy="14" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="14" r="1.5" fill="currentColor"/>
            <path d="M12 2v4M10 8V6M14 8V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 20v1M16 20v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="text-[13px] text-[#adadb8] font-mono tabular-nums">{viewerCount}</span>
        </div>
      </div>

      {/* ── Viewport — 16:9 ── */}
      <div
        className="relative w-full aspect-video bg-[#0e0e10] flex items-center justify-center overflow-hidden transition-colors duration-300"
        style={viewportBg ? { backgroundColor: viewportBg } : undefined}
      >

        {activeFrame ? (
          renderFrame(activeFrame, terminalBuffer, frameKey, duetContext, pollContext)
        ) : (
          <IdleView />
        )}

        {/* Batch progress bars */}
        {isBatchPlaying && batchSlides.length > 0 && (
          <BatchProgressBars slides={batchSlides} currentIndex={batchIndex} />
        )}

        {/* Stacking notification toasts — bottom-right */}
        {notifications.length > 0 && (
          <div className="absolute bottom-10 right-3 z-20 flex flex-col gap-2 items-end pointer-events-none">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={notif.exiting ? "notif-exit" : "notif-enter"}
              >
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#1a1a1f]/95 border border-[#00e5b0]/30 backdrop-blur-sm shadow-lg rounded-sm">
                  <span className="w-2 h-2 rounded-full bg-[#00e5b0] animate-pulse shrink-0" />
                  <span className="text-[12px] font-mono font-semibold text-[#00e5b0] whitespace-nowrap">{notif.name}</span>
                  <span className="text-[12px] font-sans text-[#adadb8] whitespace-nowrap">{notif.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
