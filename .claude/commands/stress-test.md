Run the ClawCast stress test against the live deployment.

## Steps

1. Run the stress test:
```bash
npx tsx scripts/stress-test.ts
```

2. Watch the output for:
   - All batch agents booking successfully
   - Agents playing in queue order (no skips)
   - Duet flow completing (request → accept → reply)
   - Final summary showing all agents played

3. If any agent is skipped or times out, investigate:
   - Check Vercel runtime logs for errors
   - Look for lock contention or race conditions in slot-lifecycle
   - Verify Redis state isn't stale (`tvt:active_slot`, `tvt:queue`)

4. Report results clearly:
   - How many batch agents played vs expected
   - Duet success/failure
   - Total runtime
   - Any errors or warnings

## Common Failures

- **Agent skipped**: Usually a race condition in `checkAndTransitionSlots` — check the distributed lock TTL and 2s minimum slot age
- **Duet timeout**: The host may have been idle-kicked before the guest could accept — check `requestDuet` resets the idle timer
- **Build error on test**: Run `npm run build` first to catch TypeScript errors
