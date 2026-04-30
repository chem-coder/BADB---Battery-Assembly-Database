// ─── Capacity / mass / voltage formatters ───────────────────────────
// Shared formatters used wherever Dalia's capacity_summary numbers are
// displayed (ElectrodesPage, ElectrodeFormPage, AssemblyPage).
// Precision matches her formatCapacity / formatMass / formatArealCapacity
// in public/js/electrode-batch-print.js so the same value reads
// identically in Vue panels and in the printed report.

export function fmtCapacity(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(3)} мАч`
}

export function fmtArealCapacity(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(3)} мАч/см²`
}

export function fmtMass(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(4)} г`
}

export function fmtSpecCapacity(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(2)} мАч/г`
}

// Coating sidedness enum → Russian label. Blank/unknown returns dash.
export function fmtCoatingSidedness(v) {
  if (v === 'one_sided') return '1-сторонняя'
  if (v === 'two_sided') return '2-сторонняя'
  return '—'
}

// actual_fraction_status enum — tells the user whether the "факт"
// numbers in a capacity_summary are trustworthy (all input masses
// present) or derived with missing data.
export function fmtActualFractionStatus(v) {
  if (v === 'complete')   return 'полный'
  if (v === 'incomplete') return 'неполный'
  return '—'
}

// ─── capacityIncompleteHint ───────────────────────────────────────
// When a displayed capacity / N-P cell is "—" because the backend
// returned null, the user sees no explanation and no way to fix it.
// Root cause is always "some mass is missing somewhere upstream" —
// either in a tape recipe's actual masses, or in a batch's foil
// measurements, or in a material's specific_capacity. This helper
// returns a contextual Russian hint naming the exact page + form
// the user should open.
//
// `context` selects the message template:
//   - 'electrode'        — for electrode-batch capacity_summary
//                          (ElectrodesPage list + ElectrodeFormPage form).
//   - 'battery-np'       — for battery.capacity_summary.np_actual
//                          (AssemblyPage N/P cell).
//   - 'battery-cathode' / 'battery-anode'
//                        — for cathode/anode actual capacity cells
//                          (AssemblyPage capacity cells).
//
// Returns `null` when the "—" is explained by something else (e.g.
// auth error, empty summary) — callers should skip the tooltip in
// that case; upstream error messages already cover it.
//
// Pairs with `capacityIncompleteAction()` below — same dispatch tree,
// returns the action descriptor (target page + button label) for the
// clickable hint button. `Hint` returns the message string, `Action`
// returns the descriptor; both share a single source of truth via
// `_resolveCapacityHint()`.
export function capacityIncompleteHint(summary, context = 'electrode') {
  return _resolveCapacityHint(summary, context)?.message || null
}

// Sibling of capacityIncompleteHint — returns the same hint as a
// click-action descriptor: { message, action: { kind, label, payload }
// | null } | null. Action payloads:
//
//   - kind: 'open-battery-stage' — switch the AssemblyPage constructor
//     to a target stage for `payload.batteryId`. Caller scrolls to the
//     constructor and forces it open (auto-add to constructorIds).
//   - kind: 'open-tape-recipe'   — navigate to /tapes (router.push).
//     If `payload.tapeId` is present, the tapes page auto-adds it to
//     its constructor via `?select=ID&stage=recipe_actual`.
//   - kind: 'open-electrode-batch' — navigate to ElectrodesPage with
//     the batch open (`?select=ID`).
//   - kind: 'open-materials'     — navigate to /reference/materials.
//
// `summary.cathode_tape_id` / `anode_tape_id` are NOT in the standard
// battery capacity_summary, but callers may merge them in (AssemblyPage
// reads them from the constructor's tapeStates and passes the enriched
// summary). When absent, we fall back to a no-id navigation.
export function capacityIncompleteAction(summary, context = 'electrode', extra = {}) {
  return _resolveCapacityHint(summary, context, extra)
}

function _resolveCapacityHint(summary, context, extra = {}) {
  if (!summary) return null

  // ── Battery context ──
  const cathodeNull = summary.cathode_capacity_actual_mAh == null
  const anodeNull   = summary.anode_capacity_actual_mAh   == null
  const batteryId   = extra.batteryId ?? summary.battery_id ?? null
  const cathodeTapeId = extra.cathodeTapeId ?? summary.cathode_tape_id ?? null
  const anodeTapeId   = extra.anodeTapeId   ?? summary.anode_tape_id   ?? null

  if (context === 'battery-np') {
    if (!summary.cathode_count) {
      return {
        message: 'Не подключён катод — добавьте катодный электрод в секции «Электроды» конструктора.',
        action: batteryId ? { kind: 'open-battery-stage', label: 'Открыть «Электроды»', payload: { batteryId, stage: 'electrodes' } } : null,
      }
    }
    if (!summary.anode_count) {
      return {
        message: 'Не подключён анод — добавьте анодный электрод в секции «Электроды» конструктора.',
        action: batteryId ? { kind: 'open-battery-stage', label: 'Открыть «Электроды»', payload: { batteryId, stage: 'electrodes' } } : null,
      }
    }
    if (cathodeNull && !anodeNull) {
      return {
        message: 'Для фактического N/P не хватает массы катода. Откройте катодную ленту в «Подготовка лент» → «Фактические навески рецепта».',
        action: { kind: 'open-tape-recipe', label: 'Открыть катодную ленту', payload: { tapeId: cathodeTapeId } },
      }
    }
    if (anodeNull && !cathodeNull) {
      return {
        message: 'Для фактического N/P не хватает массы анода. Откройте анодную ленту в «Подготовка лент» → «Фактические навески рецепта».',
        action: { kind: 'open-tape-recipe', label: 'Открыть анодную ленту', payload: { tapeId: anodeTapeId } },
      }
    }
    // Both null (or an unexpected edge where np is null despite both
    // actuals being set — be explicit but generic).
    return {
      message: 'Для фактического N/P нужны заполненные массы в рецептах обеих лент. Откройте ленты катода и анода в «Подготовка лент» → «Фактические навески рецепта».',
      // No single tape to open — bare /tapes navigation; user picks which.
      action: { kind: 'open-tape-recipe', label: 'Открыть «Подготовка лент»', payload: { tapeId: null } },
    }
  }
  if (context === 'battery-cathode') {
    if (!summary.cathode_count) {
      return {
        message: 'Катод не подключён — добавьте электрод в секции «Электроды» конструктора.',
        action: batteryId ? { kind: 'open-battery-stage', label: 'Открыть «Электроды»', payload: { batteryId, stage: 'electrodes' } } : null,
      }
    }
    return {
      message: 'Часть навесок в рецепте катодной ленты не заполнена. Откройте ленту в «Подготовка лент» → «Фактические навески рецепта».',
      action: { kind: 'open-tape-recipe', label: 'Открыть катодную ленту', payload: { tapeId: cathodeTapeId } },
    }
  }
  if (context === 'battery-anode') {
    if (!summary.anode_count) {
      return {
        message: 'Анод не подключён — добавьте электрод в секции «Электроды» конструктора.',
        action: batteryId ? { kind: 'open-battery-stage', label: 'Открыть «Электроды»', payload: { batteryId, stage: 'electrodes' } } : null,
      }
    }
    return {
      message: 'Часть навесок в рецепте анодной ленты не заполнена. Откройте ленту в «Подготовка лент» → «Фактические навески рецепта».',
      action: { kind: 'open-tape-recipe', label: 'Открыть анодную ленту', payload: { tapeId: anodeTapeId } },
    }
  }

  // ── Electrode-batch context (ElectrodesPage / ElectrodeFormPage) ──
  const tapeId    = extra.tapeId    ?? summary.tape_id    ?? null
  const cutBatchId = extra.cutBatchId ?? summary.cut_batch_id ?? null
  const status = summary.actual_fraction_status
  if (status === 'unavailable') {
    return {
      message: 'Фактические массы в рецепте ленты не заполнены. Откройте «Подготовка лент» → выберите нужную ленту → таблица «Фактические навески рецепта».',
      action: { kind: 'open-tape-recipe', label: 'Открыть «Подготовка лент»', payload: { tapeId } },
    }
  }
  if (status === 'incomplete') {
    return {
      message: 'Часть навесок в рецепте ленты не заполнена. Откройте ленту в «Подготовка лент» и проверьте все строки рецепта.',
      action: { kind: 'open-tape-recipe', label: 'Открыть ленту', payload: { tapeId } },
    }
  }
  if (Number(summary.foil_measurement_count) === 0) {
    return {
      message: 'Нет замеров массы фольги. Добавьте замер во вкладке замеров партии нарезки.',
      action: cutBatchId ? { kind: 'open-electrode-batch', label: 'Открыть партию', payload: { cutBatchId } } : null,
    }
  }
  if (!Number.isFinite(Number(summary.specific_capacity_mAh_g))) {
    return {
      message: 'Не указана удельная ёмкость активного материала. Откройте материал в «Материалы» → свойства и заполните.',
      action: { kind: 'open-materials', label: 'Открыть «Материалы»', payload: {} },
    }
  }
  return null
}
