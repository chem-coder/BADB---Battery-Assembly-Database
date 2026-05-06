# RENERA Documentation Audit Report

Created: 2026-05-06
Edited: 2026-05-06

Scope: documentation-like files and folders in `/Users/Dalia/Developer/RENERA`.

Initial audit pass did not move, rename, delete, or rewrite existing files. On 2026-05-06, Dalia approved moving consolidated electrode/sidedness scratch docs to `RENERA/historical_rubbish/`; this report was updated to reflect that cleanup. I inspected Markdown/text documentation, folder names, and a few targeted current-code/schema references only where a doc made a concrete claim about current behavior. Large binaries were not opened; their names are listed only where relevant.

Authority rule used for this report:

1. Current `BADB_main` source code and migrations are more authoritative than notes.
2. Current shared docs in `BADB_main/docs`, `BADB_main/Документация ЕСПД`, and migration docs are more authoritative than private notes, once checked against code.
3. `MemPalace` is historical/general reference and is not a BADB source of truth unless deliberately re-approved.
4. `archive/` is historical recovery material, not an active documentation source.

## 1. Current Documentation Map

| Path | Likely purpose | Appears | Notes |
|---|---|---|---|
| `BADB_main/README.md` | Minimal public/shared repo intro | Current but thin | Names the project and contributors only. Candidate to expand later, but keep in repo. |
| `BADB_main/CLAUDE.md` | Shared AI/developer operating guide for the app repo | Current, source-of-truth candidate | Contains repo structure, ports, commands, invariants, and audit workflow. Some statements such as "Vue planned" should be reviewed because Vue code now exists. |
| `BADB_main/docs/` | Shared implementation specs, policies, handoff docs | Mixed current/plans/stale | Should remain inside the GitHub repo when useful to Dima/shared work. Needs status labels per file. |
| `BADB_main/docs/vanilla_auth_policy.md` | Auth and ownership policy for vanilla app/API | Current, source-of-truth candidate | Aligns with hardening plan and route checks. Keep shared. |
| `BADB_main/docs/schema_api_naming.md` | Canonical schema/API naming compatibility notes | Current, source-of-truth candidate | Important because older notes use `specific_capacity_mAh_g`; current canonical spelling is `specific_capacity_mah_g`. |
| `BADB_main/docs/upload_storage_transition_plan.md` | Active security/storage transition plan | Current active plan | Correctly identifies a live issue: `app.js` still exposes `/uploads` statically. Keep shared until implemented. |
| `BADB_main/docs/battery_projects_many_to_many_plan.md` | Battery projects M:N implementation plan | Partly outdated/implemented | Migration `d030_battery_projects_many_to_many.sql`, `batteryProjectService`, and vanilla UI references now exist. Convert from "plan/current behavior" to implementation note or archive after final confirmation. |
| `BADB_main/docs/battery_electrode_stack_design.md` | Battery source/stack workflow design | Current-ish, source candidate | Useful shared doc, but it points to a private local file as "Source of truth"; that must be fixed before relying on it as shared docs. |
| `BADB_main/docs/battery_page_premerge_checklist.md` | Temporary manual QA checklist | Temporary | Archive after the relevant merge/release is complete. |
| `BADB_main/docs/CYCLING_SPEC.md` | Cycling module technical spec | Partly outdated | Base schema matches `015_cycling.sql`, but it omits later `019`/`020` metrics and active mass behavior. |
| `BADB_main/docs/TRACEABILITY_SPEC.md` | Traceability proposal/spec | Partly outdated/implemented | It says `updated_by/updated_at` are absent and names a hypothetical migration, but `013_traceability.sql` and `middleware/trackChanges.js` exist. |
| `BADB_main/docs/DASHBOARD_SPEC.md` | Future dashboard/command-center design | Unclear/aspirational | Treat as product vision unless someone confirms it reflects current implementation. |
| `BADB_main/docs/DALIA_MIGRATION_GUIDE.md` | Vue form-page PrimeVue migration guide | Outdated/unclear | Refers to `AssemblyFormPage.vue` and `TapeFormPage.vue`, which are not present; only `ElectrodeFormPage.vue` exists. |
| `BADB_main/Документация ЕСПД/` | Formal Russian technical documentation package | Shared draft, needs review | Draft v0.1.8. Must likely stay in `BADB_main` if shared with a colleague or needed for RENERA. Uses old source labels such as `dalia-main/`; update after review. |
| `BADB_main/Документация ЕСПД/README.md` | ЕСПД package index/status | Source candidate for formal docs | Says all docs are draft and need review by Dalia/RENERA. Keep. |
| `BADB_main/Документация ЕСПД/00. Карта инвентаризации.md` | Internal ЕСПД code/doc inventory | Historical support/current-ish | Useful but based on code path `dalia-main/` and `.local` archives from 2026-04-22. Not current source of truth without refresh. |
| `BADB_main/migrations/README.md` | Migration process/invariants/history | Current, source-of-truth candidate | Keep in repo. It is the best docs source for migration rules. |
| `BADB_main/migrations/migrations_log.txt` | Manual "last applied" migration note | Updated but terse | Says `Dalia: 017_ and d031_` after the battery stack trigger hardening migration. Verified on local `badb_app_v1` on 2026-05-06: `validate_battery_stack()` allows equal counts or one extra anode, rejects one extra cathode, and includes UPDATE handling. Still environment-specific for Dima/Roma databases. |
| `BADB_main/migrations_ASCII/` | ASCII mirror of migrations for the Windows PC where the production DB is used | Required/current support mirror | Must stay. Every migration added or updated in `BADB_main/migrations/` must also have the corresponding ASCII-safe version kept in sync here. |
| `BADB_main/sql_scripts/README.txt` | SQL helper usage note | Current support doc | Keep near scripts. |
| `BADB_main/scripts/launchd/README.md` | macOS backup runbook | Current support doc | Keep if macOS backup path still relevant. |
| `BADB_main/windows_scripts/README.md` | Windows backup runbook | Current support doc | Keep; likely important for deployment docs. |
| `BADB_main/scripts/cycling-fixtures/README.md` | Cycling parser fixture docs | Current support doc | Keep with parser fixtures. |
| `BADB_main/scripts/cycling-fixtures/*.txt` | Parser test fixtures | Data fixtures, not docs | Keep with tests/scripts, not in docs cleanup. |
| `BADB_main/client/README.md` | Excel/VBA client overview | Current if Excel client remains active | Needs human decision on whether Excel client is still supported. |
| `BADB_main/client/CLAUDE.md` | Excel/VBA client agent/dev notes | Mixed current/legacy | Contains deprecated modules and TODOs; keep only if Excel client active. |
| `BADB_main/client/src/DEPENDENCY_GRAPH.md` | Generated VBA dependency graph | Possibly stale | Generated 2026-03-13 from old path; keep only if still useful to Excel-client work. |
| `BADB_main/client-web/README.md` | Default Vue/Vite template README | Outdated/duplicate | Safe candidate to replace or archive later; not a BADB source of truth. |
| `notes/` | Private/local BADB notes and runbooks | Mixed current/stale | Should not be treated as shared docs unless promoted deliberately. |
| `notes/BADB_APP_ARCHITECTURE.md` | Local architecture overview | Source-of-truth candidate, private | Good private current map of active app architecture. Could be promoted into `BADB_main/docs` after review. |
| `notes/BADB_APP_PROJECT_MAP.md` | Workspace map | Outdated | Mentions root `badb_dima/` and `PROJECT_MAP.md`; current tree has `archive/badb_dima/` and no root `PROJECT_MAP.md`. |
| `notes/LAUNCHING_BADB_MAIN.md` | Local launch/auth bypass runbook | Current private runbook | Duplicates `bypass.txt`. Keep one canonical local runbook. |
| `notes/BADB_HARDENING_PLAN.md` | Hardening work log and plan | Mostly current but partly stale | Useful process history; latest "next task" references a file that does not exist. |
| `notes/BADB_DELETE_AND_DISASSEMBLY_SAFETY_PLAN.md` | Delete/disassembly safety plan | Status outdated | File says draft before implementation, but routes/services/UI now implement disassemble/delete flows. Convert to implemented spec or archive after comparing. |
| `notes/BADB_VANILLA_REFERENCE_PAGE_UPGRADE_PLAN.md` | Active vanilla reference-page rollout plan | Current private plan | Created/updated 2026-05-05; likely keep private until promoted. |
| `notes/BADB_Vanilla_Auth_Hardening.md` | Auth hardening manual checklist | Likely complete/archive | Current policy lives in `BADB_main/docs/vanilla_auth_policy.md`. |
| `notes/BATTERY_ASSEMBLY_LOGS_REFERENCES.md` | External/reference research for battery logs | Reference/background | Keep private reference. Not app truth. |
| `notes/Capacity Calculations.md`, `notes/IDEAS.md`, `notes/BADB_Feature_Ideas.md` | Backlog/idea notes | Mixed, partly superseded | Need extraction into a clean backlog before archiving. |
| `notes/pg_dump workflow.md` | Local DB backup/runbook note | Current private runbook | Could join a local runbooks folder. |
| `notes/merging_branches_workflow.md` | Git/branch collaboration runbook | Current-ish private runbook | Keep if still used. |
| `notes/GitHub steps.md` | Branch-specific merge note | Outdated/archive | Names old branches and says "for now". |
| `prompts_and_logic/` | Private prompt/context/domain notes for Codex | Mixed current/duplicates/raw | Should become private local docs, not repo-shared docs by default. |
| `prompts_and_logic/materials-inventory-context.md` | Materials inventory domain context | Source-of-truth candidate, private | Very detailed. Some schema names should be reconciled with current canonical naming. |
| `prompts_and_logic/Material Sources Information.md` | Material-source model proposal | Partly implemented/source candidate | Current migrations `d026`/`d027` implement much of it. Convert to current spec or archive as proposal. |
| `prompts_and_logic/capacity-calculations-context.md` | Capacity calculation domain context | Source-of-truth candidate, private | Valuable but uses older `specific_capacity_mAh_g` spelling. Reconcile with `schema_api_naming.md`. |
| `prompts_and_logic/capacity-calculations-implementation-plan.md` | Capacity implementation plan | Source candidate/partly stale | Good feature plan, but current schema/API naming should be corrected. |
| `prompts_and_logic/density-calculation-context.md` | Density calculation context | Source-of-truth candidate, private | Good source candidate; keep private unless promoted. |
| `historical_rubbish/prompts_and_logic/Sidedness.md`, `historical_rubbish/prompts_and_logic/2-sided_tapes_steps.md` | Archived sidedness/coating notes | Archived after consolidation | Useful intent was folded into `prompts_and_logic/electrodes-logic.md`. Current schema uses `tape_step_coating.coating_sidedness`, not `tapes.sidedness`. |
| `prompts_and_logic/Fix coating step.md` | Remove separate drying UI prompt | Implemented/archivable | Current `1-tapes.html/js` shows drying-tape values controlled through coating fields and backend drying route retained. Archive after verification. |
| `prompts_and_logic/state-*.md` | Workflow section state/dirty/progression rules | Source candidates, private | Good reusable agent prompts. Keep in private prompts area. |
| `prompts_and_logic/db-strict-no-assumptions.md` | DB inspection safety rule | Source candidate, private | Good Codex prompt rule. |
| `prompts_and_logic/how-to-interact*.md` | Personal collaboration instructions | Private/local only | Not BADB documentation. Keep outside shared repo. |
| `prompts_and_logic/electrodes-logic.md` | Current private technical reference for battery electrode logic, sidedness, source selection, and stack locking | Source-of-truth candidate, private | Consolidated from older electrode/sidedness notes on 2026-05-06. Keep as the high-detail agent reference unless promoted into `BADB_main/docs`. |
| `historical_rubbish/prompts_and_logic/electrodes mess/` | Archived electrode/battery scratch notes and test transcript | Archived after consolidation | Useful source/stack logic and checkbox-debug lessons were folded into `prompts_and_logic/electrodes-logic.md`. |
| `MemPalace/` | Generic MemPalace setup guide | Historical/unclear, not BADB source | User said probably outdated. Treat as historical unless explicitly revived. |
| `archive/` | Old BADB copies, SQL dumps, old notes/plans | Archive | Do not use as source of truth. Some readmes point to old root paths and DB names. |
| `archive/notes and plans/` | Old setup/schema/git notes | Archive | Already in archive; keep only for recovery/history. |
| `demo_baseline_data/` | Seed/demo data, not docs | Data fixture/local | `.txt` files look like baseline data exports. Binaries found but not opened: `badb_demo_seed_v1.xlsx`, `recipes.pdf`. |
| `bypass.txt` | Local auth-bypass launch note | Duplicate/current-ish | Duplicates `notes/LAUNCHING_BADB_MAIN.md`; consolidate. |
| `fresh_install_how_to.txt` | Local/Windows install scratch | Unclear/private runbook | Could be incorporated into local runbook or ЕСПД system-programmer guide if still correct. |
| `check_which_migrations.txt` | Manual DB schema check query | Useful scratch/runbook | Move into private DB runbooks or script docs later; do not treat as canonical applied-migration log. |
| `Pass 2 Styling Test Checklist.md` | Temporary styling QA checklist | Temporary/archive | Archive after test status captured. |
| `Patent/Patent-info.md` | Private legal/IP note | Private/local | Not app docs. Keep out of `BADB_main` unless legal docs are intentionally shared. |
| `Pasted image 20260428154507.png` | Uninspected root image | Unclear | Binary not opened. Likely Obsidian paste; decide whether it belongs to a note, private asset folder, or archive. |

## 2. Proposed Folder Structure

### Shared docs that should stay in `BADB_main`

Use `BADB_main` only for documentation that should travel with the GitHub repo or be shared with Dima/RENERA.

Suggested target shape:

```text
BADB_main/
  README.md
  CLAUDE.md
  docs/
    policies/
      vanilla_auth_policy.md
      schema_api_naming.md
    specs/
      cycling_spec.md
      battery_electrode_stack_design.md
      upload_storage_transition_plan.md
    plans/
      dashboard_spec.md
      battery_projects_many_to_many_plan.md
    checklists/
      battery_page_premerge_checklist.md
    archive/
      YYYY-MM-topic/
  Документация ЕСПД/
    README.md
    00...
```

Do not rename `BADB_main/Документация ЕСПД/` until Dima/shared links are reviewed. It may be safer to keep that path as-is.

### Private/local docs that should live outside `BADB_main`

Suggested outer workspace shape:

```text
RENERA/
  local_docs/
    badb/
      architecture/
      runbooks/
      feature_plans/
      domain_context/
      prompts/
      qa_checklists/
      legal_ip/
  local_data/
    demo_baseline_data/
  codex_outputs/
    YYYY-MM-DD_topic/
  archive/
    docs/
      YYYY-MM-topic/
```

The exact folder names can be shorter, but the important separation is:

- repo-shared truth: `BADB_main/...`
- private notes/prompts: outside `BADB_main`
- generated agent reports: `codex_outputs/...`
- old material: `archive/docs/...`

### Archived/outdated docs

Use two archive locations:

- `RENERA/archive/docs/YYYY-MM-topic/` for private/local old docs.
- `BADB_main/docs/archive/YYYY-MM-topic/` only for old shared docs that must remain in the repo for colleague/history reasons.

Avoid storing private Dalia prompts inside `BADB_main/docs/archive`; that still pushes them to GitHub.

### Codex agent outputs

Create a single private area:

```text
RENERA/codex_outputs/
  2026-05-06_docs-audit/
  2026-05-XX_feature-name/
```

Rule: Codex outputs are private by default. Promote only reviewed, stable docs into `BADB_main/docs`.

## 3. Files That Appear Safe To Archive

Do not move these yet. These are candidates after human review.

| File/folder | Reason |
|---|---|
| `MemPalace/` | Generic memory-tool setup, not BADB source of truth; user already suspects it is outdated. |
| `archive/notes and plans/*` | Already archived setup/schema/git notes. |
| `archive/badb_pure/README.md`, `archive/merging/README.md`, `archive/badb_dima/*README.md` | Archived app copies; readmes conflict with current folder/DB names. |
| `BADB_main/client-web/README.md` | Default Vue/Vite template text; not BADB-specific. Replace later with a real Vue client README or archive. |
| `BADB_main/docs/battery_page_premerge_checklist.md` | Temporary pre-merge checklist. Archive after the relevant feature is merged/tested. |
| `BADB_main/docs/DALIA_MIGRATION_GUIDE.md` | References missing Vue files and appears superseded by current page structure. Archive after Dima/Dalia confirm no pending migration use. |
| `notes/GitHub steps.md` | Branch-specific note about old work. |
| `notes/BADB_Vanilla_Auth_Hardening.md` | Checklist likely superseded by `BADB_main/docs/vanilla_auth_policy.md` and smoke coverage. |
| `Pass 2 Styling Test Checklist.md` | Temporary QA checklist. Archive after unresolved boxes are either done or copied to active QA backlog. |
| `prompts_and_logic/Fix coating step.md` | Looks implemented; archive after quick verification that no separate `drying_tape` UI remains. |
| `historical_rubbish/prompts_and_logic/electrodes mess/test.txt` | Raw test transcript/scratch note. Already archived after the useful checkbox-state lesson was merged into `prompts_and_logic/electrodes-logic.md`. |
| `historical_rubbish/prompts_and_logic/Sidedness.md`, `historical_rubbish/prompts_and_logic/2-sided_tapes_steps.md` | Duplicate content. Already archived after the current `coating_sidedness` truth was consolidated into `prompts_and_logic/electrodes-logic.md`. |
| `bypass.txt` | Duplicate of `notes/LAUNCHING_BADB_MAIN.md`; archive after one canonical launch runbook is created. |
| `fresh_install_how_to.txt` | Scratch install note; archive after correct Windows/fresh-install steps are copied into a runbook or ЕСПД guide. |
| `notes/BADB_APP_PROJECT_MAP.md` | Outdated workspace map. Archive after replacing with a current map. |

Files that are "safe to archive after extraction", not immediately:

| File/folder | Reason to delay |
|---|---|
| `notes/Capacity Calculations.md`, `notes/IDEAS.md`, `notes/BADB_Feature_Ideas.md` | Extract open backlog items first. |
| `notes/BADB_DELETE_AND_DISASSEMBLY_SAFETY_PLAN.md` | Status is stale, but implemented behavior should be compared first; may become a current spec. |
| `BADB_main/docs/TRACEABILITY_SPEC.md` | Partly implemented; better to update to "implementation status" than archive blindly. |
| `BADB_main/docs/CYCLING_SPEC.md` | Still a useful spec, but needs updates for migrations `019`/`020`. |

## 4. Source-Of-Truth Candidates

| File/folder | Reason |
|---|---|
| `BADB_main/migrations/*.sql` | Current schema changes. Most authoritative for database structure. |
| `BADB_main/migrations_ASCII/*.sql` | Required ASCII-safe migration mirror for the Windows production DB environment. Must be updated in lockstep with `BADB_main/migrations/*.sql`. |
| `BADB_main/migrations/README.md` | Best current source for migration rules and naming namespaces. |
| `BADB_main/docs/vanilla_auth_policy.md` | Current shared policy for auth and ownership fields. |
| `BADB_main/docs/schema_api_naming.md` | Current shared naming compatibility decision for `specific_capacity_mah_g` and `separators.js`. |
| `BADB_main/docs/upload_storage_transition_plan.md` | Current shared active plan for upload storage security. |
| `BADB_main/docs/battery_electrode_stack_design.md` | Good shared spec candidate once the private "source of truth" reference is removed/replaced. |
| `BADB_main/docs/CYCLING_SPEC.md` | Source candidate after updating with `019_cycling_summary_extra_metrics.sql` and `020_cycling_active_mass.sql`. |
| `BADB_main/Документация ЕСПД/README.md` and sibling ЕСПД docs | Formal documentation source candidate; still draft and needs review. |
| `notes/BADB_APP_ARCHITECTURE.md` | Strong private architecture source candidate. Could be promoted to shared docs. |
| `notes/LAUNCHING_BADB_MAIN.md` | Good private launch runbook candidate after deduping `bypass.txt`. |
| `notes/BADB_VANILLA_REFERENCE_PAGE_UPGRADE_PLAN.md` | Active private rollout plan as of 2026-05-05. |
| `prompts_and_logic/materials-inventory-context.md` | Strong private domain source for materials inventory. |
| `prompts_and_logic/Material Sources Information.md` | Useful source for material source/procurement model; reconcile with migrations `d026`/`d027`. |
| `prompts_and_logic/capacity-calculations-context.md` and `capacity-calculations-implementation-plan.md` | Strong private source for capacity calculations; reconcile naming with `schema_api_naming.md`. |
| `prompts_and_logic/density-calculation-context.md` | Good private source for density behavior. |
| `prompts_and_logic/state-strict-no-assumptions.md`, `state-standard.md`, `state-working-prompt.md` | Useful reusable Codex workflow-state prompts. Keep private unless generalized. |
| `prompts_and_logic/db-strict-no-assumptions.md` | Useful reusable DB-safety prompt. Keep private. |
| `BADB_main/client/README.md` and `BADB_main/client/src/DEPENDENCY_GRAPH.md` | Source candidates only if Excel/VBA client remains active. |
| `Patent/Patent-info.md` | Source candidate for private IP/legal track, not app docs. |

## 5. Files That Conflict With Current App Behavior Or Current Evidence

| File | Conflict | Current evidence | Recommendation |
|---|---|---|---|
| `BADB_main/docs/TRACEABILITY_SPEC.md` | Says `updated_by`/`updated_at` are absent and proposes a hypothetical `009_add_traceability_columns.sql`. | `BADB_main/migrations/013_traceability.sql` adds `updated_by`, `updated_at`, and `field_changelog`; `BADB_main/middleware/trackChanges.js` exists; routes import/use `trackChanges`. | Update spec to "implemented baseline + remaining gaps"; do not treat it as a future-only plan. |
| `BADB_main/docs/battery_projects_many_to_many_plan.md` | "Current Behavior" says batteries still have only one `project_id`. | `BADB_main/migrations/d030_battery_projects_many_to_many.sql` creates `battery_projects`; `BADB_main/services/batteryProjectService.js` exists; `BADB_main/public/js/3-batteries.js` uses `project_ids`. | Convert to implementation note or archive after final verification. |
| `BADB_main/docs/CYCLING_SPEC.md` | Spec lacks current extra metrics and active mass; file-security checklist says uploads should be outside Express static. | `019_cycling_summary_extra_metrics.sql` adds `energy_efficiency`, `avg_charge_voltage_v`, `avg_discharge_voltage_v`; `020_cycling_active_mass.sql` adds `active_mass_mg`; `routes/cycling.js` and Vue cycling components use these. `BADB_main/app.js:51` still exposes `/uploads`. | Update cycling spec and link to upload-storage transition plan. |
| `BADB_main/docs/upload_storage_transition_plan.md` | Not a doc error, but it documents a live code risk: static `/uploads` exposure. | `BADB_main/app.js:51` has `app.use('/uploads', express.static(path.join(__dirname, 'uploads')));`; Vue/vanilla battery electrochem still use `file_link` paths under `/uploads`. | Keep active; implement in later code task. |
| `BADB_main/docs/DALIA_MIGRATION_GUIDE.md` | Refers to `AssemblyFormPage.vue` and `TapeFormPage.vue`; current page files differ. | `find BADB_main/client-web/src/pages -name '*FormPage.vue'` finds only `ElectrodeFormPage.vue`; current pages include `AssemblyPage.vue` and `TapesPage.vue`. `ElectrodeFormPage.vue` already imports PrimeVue components. | Archive or rewrite for current Vue pages. |
| Archived `historical_rubbish/prompts_and_logic/Sidedness.md` and part of `historical_rubbish/prompts_and_logic/2-sided_tapes_steps.md` | Say sidedness is determined by `tapes.sidedness`. | Current migration and code use `tape_step_coating.coating_sidedness`; vanilla tapes/electrodes/batteries JS read/display `coating_sidedness`. | Resolved for active notes by consolidating current behavior into `prompts_and_logic/electrodes-logic.md`; keep archived files for history only. |
| `notes/BADB_DELETE_AND_DISASSEMBLY_SAFETY_PLAN.md` | Status says "draft for review before implementation". | `routes/batteries.js` has `POST /:id/disassemble`; `services/batteryLifecycleService.js` implements `disassembleBattery` and `deleteBatteryRecord`; vanilla batteries JS has disassembly UI logic. | Update status to implemented/partially implemented and compare planned vs actual behavior. |
| `notes/BADB_HARDENING_PLAN.md` | "Recommended Next Task" points to `notes/BADB_BATTERY_DELETE_AND_EDIT_PLAN.md`, which is not present. | `rg --files notes` shows `BADB_DELETE_AND_DISASSEMBLY_SAFETY_PLAN.md`, not `BADB_BATTERY_DELETE_AND_EDIT_PLAN.md`; current code implements lifecycle services. | Update final recommendation or archive older phase note. |
| `notes/BADB_APP_PROJECT_MAP.md` | Describes root `badb_dima/` and `PROJECT_MAP.md`. | Current top-level folders are `BADB_main`, `MemPalace`, `Patent`, `archive`, `demo_baseline_data`, `notes`, `prompts_and_logic`; `badb_dima` is under `archive/`; no root `PROJECT_MAP.md` exists. | Replace with a fresh workspace map. |
| `archive/badb_dima/README.md` | Launch path says `/Users/Dalia/Developer/RENERA/badb_dima`; DB name says `badb_v1`. | Current app repo is `BADB_main`; current migration README references `badb_app_v1`. | Keep archived; do not use for launch/setup. |
| `BADB_main/Документация ЕСПД/*` | Several docs refer to source path `dalia-main/` and old `.local` source archives. | Actual app repo path in this workspace is `BADB_main`; user states `BADB_main` is the GitHub-pushed app repo. | Refresh ЕСПД sources/paths before treating as fully current. |
| Capacity/material notes in `prompts_and_logic/` and `notes/` | Many use `specific_capacity_mAh_g`. | `BADB_main/docs/schema_api_naming.md` says canonical database/API spelling is `specific_capacity_mah_g`; API still accepts/returns mixed-case alias for compatibility. | Normalize docs to canonical spelling and mention alias only where relevant. |
| `BADB_main/migrations/migrations_log.txt` and ASCII copy | "Last applied" note is compact and environment-specific. | Migration files include numeric `020_cycling_active_mass.sql` and Dalia `d031_harden_battery_stack_validate_trigger.sql`; log leaves Dima/Roma blank. | Local `badb_app_v1` was checked on 2026-05-06 and has `d031` behavior. Verify separately only for non-Dalia/non-local environments. |

## 6. Unclear Files Requiring Human Decision

| File/folder                                         | Decision needed                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `BADB_main/Документация ЕСПД/`                      | Must it stay exactly where it is for Dima/RENERA sharing, or can it later move under `BADB_main/docs/formal/`?       |
| `BADB_main/client/` docs                            | Is the Excel/VBA client still active and supported, or historical?                                                   |
| `BADB_main/docs/DASHBOARD_SPEC.md`                  | Is this a current roadmap item, a design proposal, or a future/archive concept?                                      |
| `BADB_main/docs/DALIA_MIGRATION_GUIDE.md`           | Any remaining value, or archive because Vue page names changed?                                                      |
| `BADB_main/docs/battery_page_premerge_checklist.md` | Has the relevant merge already happened?                                                                             |
| `demo_baseline_data/`                               | Should these seed/demo data files stay private/local, move into BADB_main as fixtures, or remain where they are?     |
| `Patent/Patent-info.md`                             | Should this be kept private under local legal/IP docs?                                                               |
| `MemPalace/`                                        | Archive as outdated, delete later, or keep as a non-BADB reference?                                                  |
| `prompts_and_logic/how-to-interact*.md`             | Keep as private assistant preference docs, or remove from project documentation entirely?                            |
| `notes/BADB_HARDENING_PLAN.md`                      | Keep as active hardening log, freeze as history, or split completed phases into archive and open tasks into backlog? |
| `notes/BADB_DELETE_AND_DISASSEMBLY_SAFETY_PLAN.md`  | Update to match implemented behavior or archive as pre-implementation plan?                                          |
| `Pasted image 20260428154507.png`                   | Does it belong to a note, a private assets folder, or archive?                                                       |

## 7. Recommended Next Cleanup Task Prompt

Use this prompt after reviewing and approving the proposed moves. Fill in the human decisions first.

```text
Task: Organize RENERA documentation files according to the reviewed docs audit. This time you may move/rename documentation files only. Do not edit application code.

Context:
- RENERA is the outer private/local workspace.
- BADB_main is the GitHub-pushed app repo.
- Shared docs that Dima/RENERA need should stay in BADB_main.
- Private notes/prompts/legal/local runbooks should stay outside BADB_main.
- Do not delete anything. Archive instead.
- Preserve git history where possible for files inside BADB_main.

Inputs:
- Read RENERA/docs_audit_report.md first.
- Human-approved decisions:
  1. [paste which BADB_main docs are allowed to move inside BADB_main]
  2. [paste whether Документация ЕСПД stays in place]
  3. [paste whether Excel/VBA client docs are active]
  4. [paste whether MemPalace should be archived]
  5. [paste any files to leave untouched]

Allowed actions:
- Create documentation folders only.
- Move/rename documentation files only.
- Do not modify source code, migrations, schemas, package files, or data files.
- Do not inspect large binaries except by filename.
- Do not delete files.
- Do not move anything out of BADB_main unless it is explicitly approved as private/local.
- Do not archive or remove BADB_main/migrations_ASCII; it is required for the Windows production DB environment and must stay synchronized with BADB_main/migrations.
- For BADB_main files, use git-aware moves when possible.
- Update markdown links only when they point to files you moved.
- Create one move log at RENERA/docs_cleanup_move_log.md listing old path, new path, and reason.

Suggested organization:
- BADB_main/docs/policies/
- BADB_main/docs/specs/
- BADB_main/docs/plans/
- BADB_main/docs/checklists/
- BADB_main/docs/archive/YYYY-MM-docs-cleanup/
- RENERA/local_docs/badb/architecture/
- RENERA/local_docs/badb/runbooks/
- RENERA/local_docs/badb/feature_plans/
- RENERA/local_docs/badb/domain_context/
- RENERA/local_docs/badb/prompts/
- RENERA/local_docs/badb/qa_checklists/
- RENERA/local_docs/badb/legal_ip/
- RENERA/codex_outputs/
- RENERA/archive/docs/YYYY-MM-docs-cleanup/

Deliverables:
1. Move/rename files according to the approved decisions.
2. Do not change app behavior.
3. Do not delete anything.
4. Produce RENERA/docs_cleanup_move_log.md.
5. Summarize remaining unclear files that still need human decision.
```
