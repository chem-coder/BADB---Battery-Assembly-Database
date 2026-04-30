// ─── useBackendCache — fetch-by-id with cache, dedup, throttle ───────
// Replaces the 3 copies of the "fetch X by id, cache, show loading/error
// in UI" pattern that lived in AssemblyPage, ElectrodesPage, CyclingPage.
// Built design-first after the A+B retrospective (5 audit rounds per
// feature became 1 under the new flow).
//
// Features:
// - Concurrent fetch cap via an in-module semaphore (caller-tunable).
// - Post-acquire dedup so racing callers for the same id don't double-fetch.
// - Invalidation-during-fetch race handled via a per-id generation
//   counter: an in-flight result is silently dropped if `invalidate(id)`
//   was called during the fetch.
// - Error classification delegated to utils/errorClassifier (pure —
//   auth/missing/server/network) + an orthogonal 'empty' verdict
//   produced here when the caller-supplied isEmpty() returns true on
//   a 2xx response.
//
// Usage:
//   const cap = useBackendCache({
//     fetchFn: async (id) => {
//       const { data } = await api.get(`/api/batteries/${id}/assembly`)
//       return data?.capacity_summary || null
//     },
//     maxConcurrent: 3,
//     isEmpty: (s) => !s || (s.cathode_count === 0 && s.anode_count === 0),
//   })
//
//   cap.load(id)              // start fetch (no-op if cached / in-flight)
//   cap.cache.value[id]       // reactive data (undefined | value | null)
//   cap.loading.value[id]     // bool
//   cap.errors.value[id]      // 'auth'|'missing'|'server'|'network'|'empty'|null
//   cap.invalidate(id)        // drop for id; next load refetches
//   cap.invalidateAll()       // drop everything
//   cap.isLoaded(id)          // cache.value[id] !== undefined

import { ref } from 'vue'
import { classifyAxiosError } from '@/utils/errorClassifier'

export function useBackendCache({
  fetchFn,
  maxConcurrent = 3,
  isEmpty = null,
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new Error('useBackendCache: fetchFn is required')
  }

  const cache   = ref({})  // { [id]: data | null }
  const loading = ref({})  // { [id]: boolean }
  const errors  = ref({})  // { [id]: enum | null }

  // Per-id generation counter. `load()` captures the current gen at
  // start; the finally block writes only if the gen hasn't advanced
  // (i.e. `invalidate(id)` wasn't called during the fetch). Prevents
  // stale responses from resurrecting a freshly-invalidated entry.
  // Stored in a Map (not a reactive ref) — it's internal bookkeeping
  // and doesn't need to trigger rerenders. Map grows monotonically
  // across the component's lifetime (entries are only bumped, never
  // deleted) — bounded by distinct ids seen during one mount. Freed
  // when the composable instance itself is GC'd on unmount.
  const invalidationGen = new Map()

  let inFlight = 0
  const queue = []

  async function load(id) {
    if (id == null) return
    // Fast-path: already cached (including null from a prior error).
    if (cache.value[id] !== undefined) return
    // Fast-path: another caller is already fetching this id.
    if (loading.value[id]) return

    // Semaphore: wait in queue if cap reached.
    if (inFlight >= maxConcurrent) {
      await new Promise(resolve => queue.push(resolve))
    }
    // Post-acquire dedup — while we were queued a concurrent caller for
    // the same id may have started its own fetch. Bail AND release the
    // queue slot so the next waiter doesn't starve.
    if (loading.value[id]) {
      const next = queue.shift()
      if (next) next()
      return
    }

    const genAtStart = invalidationGen.get(id) || 0
    inFlight++
    loading.value[id] = true

    try {
      const data = await fetchFn(id)
      // Invalidation race check — if invalidate(id) ran during our
      // fetch, the gen advanced; silently drop this result.
      if ((invalidationGen.get(id) || 0) !== genAtStart) return
      cache.value[id] = data
      errors.value[id] = isEmpty && isEmpty(data) ? 'empty' : null
    } catch (err) {
      if ((invalidationGen.get(id) || 0) !== genAtStart) return
      cache.value[id] = null
      errors.value[id] = classifyAxiosError(err)
    } finally {
      loading.value[id] = false
      inFlight--
      const next = queue.shift()
      if (next) next()
    }
  }

  function invalidate(id) {
    if (id == null) return
    delete cache.value[id]
    delete loading.value[id]
    delete errors.value[id]
    // Bump gen so any in-flight fetch for this id discards its result.
    invalidationGen.set(id, (invalidationGen.get(id) || 0) + 1)
  }

  function invalidateAll() {
    // Capture existing keys before wipe — we still need to bump gens
    // for any in-flight fetches.
    const keys = [...Object.keys(cache.value), ...Object.keys(loading.value)]
    cache.value = {}
    loading.value = {}
    errors.value = {}
    for (const k of keys) {
      invalidationGen.set(k, (invalidationGen.get(k) || 0) + 1)
    }
  }

  function isLoaded(id) {
    return cache.value[id] !== undefined
  }

  return {
    cache,
    loading,
    errors,
    load,
    invalidate,
    invalidateAll,
    isLoaded,
  }
}
