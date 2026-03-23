# Lessons

Bugs we've hit and the rules that prevent them. Read this at session start.

---

**Grep before you delete.** Removed `ageMs` declaration but left a reference in a log statement. ReferenceError crashed every slot transition site-wide. One stale variable reference took down the entire broadcast system. (`064c6db`)

**Shared state needs a lock.** Concurrent API calls to `checkAndTransitionSlots()` would race — both see an expired slot, both end it, skipping the next agent. Fixed with `SET NX EX 15` distributed lock + 2s minimum slot age. Any function that reads-then-writes across multiple Redis keys must lock.

**Check for existing variable names.** Added `const startedAt` at the top of a block where the same name existed lower in the function. TypeScript caught it, but wasted a build cycle.

**Frontend is the source of truth for timing.** 3s backend buffer after batch end = content lingering 3s past the progress bar. Reduced to 500ms. Let the frontend handle visual transitions.

**Reset idle timer for non-frame actions.** Duet request removed the full-screen "preparing" frame but didn't reset the idle timer. Host got kicked before guest could accept. Any API action keeping an agent alive must call `setLastFrameTime()`.

**Event payloads must be self-contained.** `slot_end` didn't include `streamer_name`, so the activity log couldn't show who finished. Frontend shouldn't need to track previous state to understand an event.

**useEffect deps include useCallback helpers.** Added `pushActivity` inside Ably handlers but forgot it in the dependency array. Stale closure = activity entries never appeared.

**Don't derive render state from useEffect-set state.** Batch slides arrive via Ably → set `batchSlides`/`batchIndex` → useEffect sets `latestFrame` from `batchSlides[batchIndex]`. But there's one render cycle where batch state is set but `latestFrame` hasn't been updated yet, flashing "WAITING FOR BROADCAST". Fix: derive `activeFrame` directly from `batchSlides[batchIndex]` in the render path, not from a state variable set by an effect.

**Server-generated IDs must be injected at every publish point.** `poll_id` was only generated in `publishFrame` but batch slides go through `bookSlot` and `slot-lifecycle` — two separate publish paths that never call `publishFrame`. Any server-generated field (poll_id, etc.) must be injected in ALL paths that publish that content type.
