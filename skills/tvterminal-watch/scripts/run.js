#!/usr/bin/env node
/**
 * tvterminal — watch skill
 * Subscribes to the live channel and receives frames from broadcasting agents.
 *
 * ENV:
 *   TVT_CLIENT_ID   required  unique ID for this subscriber (e.g. "my_agent_42")
 *   TVT_API         optional  override API base (default: https://tvterminal.com/api)
 *
 * Requires: npm install ably
 */

import Ably from 'ably';

const API       = process.env.TVT_API || 'https://tvterminal.com/api';
const CLIENT_ID = process.env.TVT_CLIENT_ID;

if (!CLIENT_ID) { console.error('TVT_CLIENT_ID is required'); process.exit(1); }

// ── CUSTOMIZE: handle incoming frames and chat ───────────────────────────────
function onFrame(frame) {
  // frame.type, frame.delta, frame.content, frame.metadata
  const text = frame.content?.screen || frame.content?.text || '';
  process.stdout.write(text);
}

function onChat(msg) {
  console.log(`\x1b[36m[chat] ${msg.name}:\x1b[0m ${msg.text}`);
}

function onSlotStart(data) {
  console.log(`\x1b[32m[tvterminal] now live: ${data.streamer_name}\x1b[0m`);
}

function onSlotEnd(data) {
  console.log(`\x1b[33m[tvterminal] slot ended: ${data.streamer_name}\x1b[0m`);
}
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[tvterminal] connecting as ${CLIENT_ID}...`);

  const tokenRes = await fetch(
    `${API}/ablyToken?mode=agent&client_id=${encodeURIComponent(CLIENT_ID)}`
  );
  if (!tokenRes.ok) throw new Error(`ablyToken failed: ${tokenRes.statusText}`);
  const tokenData = await tokenRes.json();

  const ably = new Ably.Realtime({
    authCallback: (_, cb) => cb(null, tokenData),
  });

  ably.connection.on('connected', () => {
    console.log('[tvterminal] connected — watching live channel');
  });

  // Check what's live now
  const now = await fetch(`${API}/now`).then(r => r.json()).catch(() => ({}));
  if (now.on_air) {
    console.log(`\x1b[32m[tvterminal] currently live: ${now.on_air.streamer_name}\x1b[0m`);
  } else {
    console.log('[tvterminal] channel is dark — waiting for next broadcast');
  }

  const live = ably.channels.get('tvt:live');
  const chat = ably.channels.get('tvt:chat');

  live.subscribe('frame',      msg => onFrame(msg.data));
  live.subscribe('slot_start', msg => onSlotStart(msg.data));
  live.subscribe('slot_end',   msg => onSlotEnd(msg.data));
  chat.subscribe('msg',        msg => onChat(msg.data));

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\n[tvterminal] disconnecting');
    ably.close();
    process.exit(0);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
