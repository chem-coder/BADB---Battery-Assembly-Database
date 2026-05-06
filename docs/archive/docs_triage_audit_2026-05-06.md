# Docs Triage Audit

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction

Scope:

- `docs/*.md`
- `docs/archive/inbox/**/*.md`

This audit began as a non-destructive classification pass and now records the
completed documentation cleanup batches.

## Executive Summary

Only `docs/README.md` and `docs/INDEX.md` should remain in the root of `docs/`.
The former root transition backlog has been moved into canonical folders or
archived with git history preserved.

The inbox now contains only Markdown files. It is safe to triage from there.

Highest-value canonicalization targets:

1. Battery lifecycle + electrode stack rules. Completed in Batch 1.
2. Materials, material composition, density, and capacity calculations. Completed in Batch 2.
3. Auth/access, migrations, launch, backup, smoke/contract/release checks. Batch 3 completed for runbooks/release checks.
4. Future feature backlog and UI/report rollout notes. Batch 4 completed for
   the selected inbox future notes.
5. Archive old implementation plans after extracting useful decisions. Batch 5
   moved the remaining obvious inbox leftovers out of the raw inbox.
6. Root-doc transition. Batch 6 moved the former root docs into canonical
   folders or archived them after extraction.

The working docs have been compressed into `docs/current/`, `docs/rules/`, and
`docs/instructions/`; Batch 8 then refreshed the formal `Документация ЕСПД/`
mirror from that canonical layer.

## Recommended Batch Order

| Batch | Goal | Why first |
|---|---|---|
| 1 | Create canonical battery/electrode docs | Most release-sensitive; many duplicated notes. |
| 2 | Create canonical materials/capacity docs | Completed. Most scientifically dense; many notes already implemented. |
| 3 | Consolidate runbooks: launch, migrations, backup, smoke, release | Completed. Helps future agents run the app without guessing. |
| 4 | Consolidate future backlog | Completed for selected inbox future notes. Preserves ideas without mixing them with current behavior. |
| 5 | Archive superseded/generated/private docs | Completed for remaining inbox leftovers. Reduces mental load after useful content is extracted. |
| 6 | Transition root docs into canonical folders | Completed. Removes the old root-doc ambiguity. |
| 7 | Audit maintained working docs | Completed. Verifies canonical docs before formal mirroring. |
| 8 | Update ЕСПД formal mirror | Completed. Formal docs now mirror canonical current/rules/instructions. |

## Root Docs Transition Result

| Former root file | Canonical result | Status | Notes |
|---|---|---|---|
| `docs/README.md` | `docs/README.md` | current | Documentation hub; root file kept. |
| `docs/INDEX.md` | `docs/INDEX.md` | current | Documentation index; root file kept. |
| `docs/CYCLING_SPEC.md` | `docs/current/cycling.md`, `docs/future/cycling_next.md`, archive copy | completed | Current implementation separated from future ideas. |
| `docs/DALIA_MIGRATION_GUIDE.md` | `docs/future/ui_and_reports_next.md`, archive copy | completed | Historical PrimeVue guide compressed into current future-UI guardrails. |
| `docs/DASHBOARD_SPEC.md` | `docs/current/dashboard.md`, `docs/future/dashboard_next.md`, archive copy | completed | Implemented route/UI facts separated from product direction. |
| `docs/TRACEABILITY_SPEC.md` | `docs/current/traceability.md`, archive copy | completed | Old hypothetical migration language no longer treated as live truth. |
| `docs/battery_page_premerge_checklist.md` | `docs/instructions/battery_premerge_checklist.md` | completed | Checklist kept as instruction. |
| `docs/battery_projects_many_to_many_plan.md` | `docs/current/project_links.md`, archive copy | completed | Implemented M:N project behavior documented as current behavior. |
| `docs/schema_api_naming.md` | `docs/rules/schema_api_naming.md` | completed | Naming compatibility kept as a rule. |
| `docs/upload_storage_transition_plan.md` | `docs/future/upload_storage_transition.md` | completed | Live security direction kept as future work because it is not implemented yet. |
| `docs/vanilla_auth_policy.md` | `docs/rules/auth_policy.md` | completed | Auth-only guided battery delete preserved as approved policy. |

## Inbox: Current/Rule Candidates

| File | Classification | Recommended destination | Verify code? | ЕСПД feed? | Notes |
|---|---|---|---|---|---|
| `docs/archive/superseded/2026-05-06-inbox-cleanup/BADB_APP_ARCHITECTURE.md` | superseded after Batch 5 | extracted to `docs/current/architecture.md` | done | yes | Current architecture doc now uses current route/service structure. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/BADB_APP_PROJECT_MAP.md` | superseded after Batch 5 | extracted to `docs/current/repo_map.md` | done | no | Stale workspace map replaced by current repo map. |
| `docs/archive/superseded/2026-05-06-battery-electrodes/BADB_DELETE_AND_DISASSEMBLY_SAFETY_PLAN.md` | superseded after Batch 1 | extracted to `docs/current/batteries.md` and `docs/rules/battery_lifecycle_rules.md` | done | yes | Historical source for guided delete and auth-only behavior. |
| `docs/archive/superseded/2026-05-06-battery-electrodes/electrodes-logic.md` | superseded after Batch 1 | extracted to `docs/current/electrodes.md`, `docs/current/batteries.md`, and `docs/rules/electrode_stack_rules.md` | done | yes | Historical source for electrode source/stack rules. |
| `docs/archive/superseded/2026-05-06-materials-capacity/Material Sources Information.md` | superseded after Batch 2 | extracted to `docs/current/materials.md`, `docs/current/capacity_calculations.md`, `docs/rules/material_composition_rules.md`, and `docs/future/materials_capacity_next.md` | done | yes | Historical source for material source, quality, and capacity ideas. |
| `docs/archive/superseded/2026-05-06-materials-capacity/materials-inventory-context.md` | superseded after Batch 2 | extracted to `docs/current/materials.md` and `docs/future/materials_capacity_next.md` | done | yes | Historical source for materials inventory model. |
| `docs/archive/superseded/2026-05-06-materials-capacity/Materials_Plan.md` | superseded after Batch 2 | extracted to `docs/current/materials.md` and `docs/rules/material_composition_rules.md` | done | yes | Historical source for instance-level composition reasoning. |
| `docs/archive/superseded/2026-05-06-materials-capacity/capacity-calculations-context.md` | superseded after Batch 2 | extracted to `docs/current/capacity_calculations.md` and `docs/future/materials_capacity_next.md` | done | yes | Historical source for capacity formulas and UI placement. |
| `docs/archive/superseded/2026-05-06-materials-capacity/capacity-calculations-implementation-plan.md` | superseded after Batch 2 | extracted to `docs/current/capacity_calculations.md` and `docs/future/materials_capacity_next.md` | done | yes | Historical implementation plan; current code is now source of truth. |
| `docs/archive/superseded/2026-05-06-materials-capacity/Capacity Calculations.md` | superseded after Batch 2 | extracted to `docs/current/capacity_calculations.md` | done | yes | Short historical capacity note. |
| `docs/archive/superseded/2026-05-06-materials-capacity/density-calculation-context.md` | superseded after Batch 2 | extracted to `docs/current/capacity_calculations.md` | done | yes | Historical density and mass/volume source note. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/db-strict-no-assumptions.md` | superseded after Batch 5 | extracted to `docs/instructions/db_schema_verification.md` | done | no | DB/schema verification pattern preserved. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/state-standard.md` | superseded after Batch 5 | extracted to `docs/instructions/workflow_state_refactor.md` | done | no | Workflow state pattern compressed. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/state-strict-no-assumptions.md` | superseded after Batch 5 | extracted to `docs/instructions/workflow_state_refactor.md` | done | no | Duplicate/strict workflow state prompt compressed. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/state-working-prompt.md` | superseded after Batch 5 | extracted to `docs/instructions/workflow_state_refactor.md` | done | no | Working prompt compressed. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/how-to-interact-with-dalia.md` | superseded after Batch 5 | extracted to `docs/instructions/agent_collaboration_guidance.md` | done | no | Collaboration preference note compressed. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/how-to-interact-short.md` | superseded after Batch 5 | extracted to `docs/instructions/agent_collaboration_guidance.md` | done | no | Short duplicate compressed. |

## Inbox: Instructions And Runbooks

| File | Classification | Recommended destination | Verify code? | ЕСПД feed? | Notes |
|---|---|---|---|---|---|
| `docs/archive/superseded/2026-05-06-runbooks-release/LAUNCHING_BADB_MAIN.md` | superseded after Batch 3 | extracted to `docs/instructions/run_local.md` | done | yes | Canonical launch/run facts moved to runbook. |
| `docs/archive/superseded/2026-05-06-runbooks-release/bypass.md` | superseded after Batch 3 | extracted to `docs/instructions/run_local.md` | done | no | Duplicate auth-bypass note compressed. |
| `docs/archive/superseded/2026-05-06-runbooks-release/fresh_install_how_to.md` | superseded after Batch 3 | extracted to `docs/instructions/run_local.md` | done | yes | Old config-editing advice replaced with env overrides. |
| `docs/archive/superseded/2026-05-06-runbooks-release/ПО.md` | superseded after Batch 3 | extracted to `docs/instructions/run_local.md` | done | yes | Windows prerequisite notes compressed. |
| `docs/archive/superseded/2026-05-06-runbooks-release/pg_dump workflow.md` | superseded after Batch 3 | extracted to `docs/instructions/backup_restore.md` | done | yes | Manual `pg_dump` kept only as fallback guidance. |
| `docs/archive/inbox/notes/merging_branches_workflow.md` | instruction | `docs/instructions/git_workflow.md` | light | no | Keep if still used. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/GitHub steps.md` | superseded after Batch 5 | extracted to `docs/instructions/git_workflow.md` | done | no | Branch-specific note compressed into general Git workflow. |
| `docs/archive/superseded/2026-05-06-runbooks-release/check_which_migrations.md` | superseded after Batch 3 | extracted to `docs/instructions/apply_migrations.md` | done | yes | d031 verification query moved to migration runbook. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/docs_audit_report.md` | superseded after Batch 5 | archived after useful map items were extracted | done | no | New triage audit supersedes it. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/Pass 2 Styling Test Checklist.md` | superseded after Batch 5 | archived after UI guidance was extracted to `docs/future/ui_and_reports_next.md` | done | no | Temporary QA checklist. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/Javascript_Outline.md` | superseded after Batch 5 | extracted to `docs/instructions/ui_api_db_mapping.md` | done | no | Section-order note preserved. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/Mapping_Plan.md` | superseded after Batch 5 | extracted to `docs/instructions/ui_api_db_mapping.md` | done | no | UI -> JS -> API -> DB mapping method preserved. |

## Inbox: Future Ideas And Product Backlog

| File | Classification | Recommended destination | Verify code? | ЕСПД feed? | Notes |
|---|---|---|---|---|---|
| `docs/archive/superseded/2026-05-06-future-backlog/BADB_Feature_Ideas.md` | superseded after Batch 4 | extracted to `docs/future/feature_backlog.md` and `docs/future/ui_and_reports_next.md` | done | no | Small backlog items compressed. |
| `docs/archive/superseded/2026-05-06-future-backlog/IDEAS.md` | superseded after Batch 4 | extracted to `docs/future/feature_backlog.md` and `docs/future/materials_capacity_next.md` | done | no | General idea backlog compressed. |
| `docs/archive/superseded/2026-05-06-materials-capacity/solids-fraction-todo.md` | superseded after Batch 2 | extracted to `docs/current/capacity_calculations.md` | done | yes | Verified current Tapes UI computes slurry solids summary. |
| `docs/archive/superseded/2026-05-06-future-backlog/BADB_VANILLA_REFERENCE_PAGE_UPGRADE_PLAN.md` | superseded after Batch 4 | extracted to `docs/future/vanilla_reference_page_upgrade.md` | done | no | Rollout plan compressed; Electrolytes current progress lightly checked. |
| `docs/archive/superseded/2026-05-06-future-backlog/UI Styling Consistency Plan.md` | superseded after Batch 4 | extracted to `docs/future/ui_and_reports_next.md` | done | no | Styling guidance compressed. |
| `docs/archive/superseded/2026-05-06-future-backlog/Printout Design.md` | superseded after Batch 4 | extracted to `docs/future/ui_and_reports_next.md` | done | maybe later | Report guidance compressed. |
| `docs/archive/superseded/2026-05-06-future-backlog/BATTERY_ASSEMBLY_LOGS_REFERENCES.md` | superseded after Batch 4 | extracted to `docs/future/battery_assembly_logs_next.md` | done | maybe | External research preserved as future reference, not current app truth. |
| `docs/archive/external_generated/legal_ip/Patent-info.md` | external/generated legal/IP note | archived outside product docs | no | no | Not app behavior and not legal advice. |

## Inbox: Mapping And Old Implementation Plans

| File | Classification | Recommended destination | Verify code? | ЕСПД feed? | Notes |
|---|---|---|---|---|---|
| `docs/archive/superseded/2026-05-06-inbox-cleanup/4-map.md` | superseded after Batch 5 | archived after mapping method was extracted | light | maybe | Converted PDF with stale `NOT IMPLEMENTED` claims; use current code for tape truth. |
| `docs/archive/superseded/2026-05-06-battery-electrodes/BAL-plan.md` | superseded after Batch 1 | extracted dependency-ordering idea to `docs/current/batteries.md` | done | maybe | Battery assembly order source note; archived after extraction. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/Fix coating step.md` | superseded after Batch 5 | archived after light tape check | done | maybe | Current UI has coating drying fields and no old `2a-drying_tape` fieldset. |
| `docs/archive/inbox/historical_rubbish/prompts_and_logic/2-sided_tapes_steps.md` | superseded | `docs/archive/superseded/` | yes only if extracting | no | Historical sidedness/coating note. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/historical_rubbish/prompts_and_logic/Sidedness.md` | superseded after Batch 5 | archived | no | Historical sidedness note; current truth is `coating_sidedness`. |
| `docs/archive/inbox/historical_rubbish/prompts_and_logic/electrodes mess/electrodes-logic.md` | superseded duplicate | `docs/archive/superseded/` | no | no | Old source for the cleaner `prompts_and_logic/electrodes-logic.md`. |
| `docs/archive/inbox/historical_rubbish/prompts_and_logic/electrodes mess/test.md` | superseded transcript/debug | `docs/archive/superseded/` | no | no | Debug transcript; likely only historical. |
| `docs/archive/superseded/2026-05-06-inbox-cleanup/BADB_Vanilla_Auth_Hardening.md` | superseded after Batch 5 | archived after checking against `docs/rules/auth_policy.md` | light | no | Current auth policy remains `docs/rules/auth_policy.md`. |
| `docs/archive/superseded/2026-05-06-runbooks-release/BADB_HARDENING_PLAN.md` | superseded after Batch 3 | extracted to `docs/instructions/testing_release.md` | done | maybe | Long worklog compressed into current smoke/contract/release checks. |

## Inbox: External Tooling / Non-BADB Product Docs

| File | Classification | Recommended destination | Verify code? | ЕСПД feed? | Notes |
|---|---|---|---|---|---|
| `docs/archive/external_generated/MemPalace/README.md` | external generated/tooling | archived outside inbox | no | no | Not BADB product docs. |
| `docs/archive/external_generated/MemPalace/INDEX.md` | external generated/tooling | archived outside inbox | no | no | Same packet as above. |
| `docs/archive/external_generated/MemPalace/project-types.md` | external generated/tooling | archived outside inbox | no | no | Same packet as above. |
| `docs/archive/external_generated/MemPalace/starter-prompt.md` | external generated/tooling | archived outside inbox | no | no | Same packet as above. |
| `docs/archive/inbox/README.md` | operating doc | keep | no | no | Inbox README; already belongs there. |

## Header/Metadata Cleanup Result

Former root docs were moved or archived during Batch 6. Promoted docs now have
formal `Created` / `Edited` / `Status` headers:

- `docs/current/cycling.md`
- `docs/current/dashboard.md`
- `docs/current/project_links.md`
- `docs/current/traceability.md`
- `docs/future/cycling_next.md`
- `docs/future/dashboard_next.md`
- `docs/future/upload_storage_transition.md`
- `docs/instructions/battery_premerge_checklist.md`
- `docs/rules/auth_policy.md`
- `docs/rules/schema_api_naming.md`

Inbox docs converted from non-md already have normalized raw-inbox headers. Many
pre-existing inbox `.md` files do not. Do not spend time normalizing all inbox
headers before triage; normalize only files promoted out of the inbox.

## Batch 1 Result

Created:

- `docs/rules/battery_lifecycle_rules.md`
- `docs/rules/electrode_stack_rules.md`
- `docs/current/batteries.md`
- `docs/current/electrodes.md`

Source notes extracted into those canonical docs should be archived as
superseded historical sources.

## Batch 2 Result

Created:

- `docs/current/materials.md`
- `docs/current/capacity_calculations.md`
- `docs/rules/material_composition_rules.md`
- `docs/future/materials_capacity_next.md`

Archived extracted sources under:

- `docs/archive/superseded/2026-05-06-materials-capacity/`

Notable corrections made during extraction:

- `specific_capacity_mah_g` is the canonical spelling; `specific_capacity_mAh_g`
  is only a compatibility alias.
- Current tape actual volume values are labeled and treated as milliliters.
- Current capacity/planning helpers use direct material-instance components;
  they do not promise unlimited transitive recursive expansion.
- The old solids-fraction TODO is superseded because the current Tapes UI
  computes slurry solids content.

## Batch 3 Result

Created:

- `docs/instructions/run_local.md`
- `docs/instructions/apply_migrations.md`
- `docs/instructions/backup_restore.md`
- `docs/instructions/testing_release.md`

Archived extracted sources under:

- `docs/archive/superseded/2026-05-06-runbooks-release/`

Notable corrections made during extraction:

- `npm run dev` already starts backend plus Vue dev server; running `npm start`
  beside it normally creates a backend port conflict.
- Development auth bypass is env-driven and production startup refuses
  `AUTH_BYPASS=true`.
- Windows database user changes should be handled with `DB_USER`, not by
  editing `config/index.js`.
- `scripts/backup.js` is the canonical backup/restore workflow; manual
  `pg_dump` is only fallback guidance.
- Vanilla smoke restores a throwaway database and applies post-dump migrations
  through `d031`.

## Batch 4 Result

Created:

- `docs/future/feature_backlog.md`
- `docs/future/vanilla_reference_page_upgrade.md`
- `docs/future/ui_and_reports_next.md`
- `docs/future/battery_assembly_logs_next.md`

Updated:

- `docs/future/materials_capacity_next.md`

Archived extracted sources under:

- `docs/archive/superseded/2026-05-06-future-backlog/`

Notable corrections made during extraction:

- Slurry solids summary is already current and belongs in
  `docs/current/capacity_calculations.md`, not future work.
- Capacity summaries are already current for materials/electrodes/batteries.
- The vanilla reference-page rollout is future guidance; Electrolytes has some
  current helper/sticky-header work but the remaining rollout is not complete.
- Print-report layout guidance was compressed into future report rules rather
  than treated as a battery-only implementation prompt.

## Batch 5 Result

Created:

- `docs/current/architecture.md`
- `docs/current/repo_map.md`
- `docs/instructions/db_schema_verification.md`
- `docs/instructions/workflow_state_refactor.md`
- `docs/instructions/git_workflow.md`
- `docs/instructions/ui_api_db_mapping.md`
- `docs/instructions/agent_collaboration_guidance.md`

Archived extracted sources under:

- `docs/archive/superseded/2026-05-06-inbox-cleanup/`
- `docs/archive/external_generated/MemPalace/`
- `docs/archive/external_generated/legal_ip/`

Notable corrections made during extraction:

- The raw inbox is now empty except for its README and allowed `.DS_Store`.
- Old workspace maps mentioning `badb_dima/` as an active root and
  `PROJECT_MAP.md` were replaced by a current `BADB_main` repo map.
- Old tape mapping/coating/sidedness notes were archived because current code
  and canonical docs supersede them.
- MemPalace and legal/IP notes were moved to external-generated archives and
  are not BADB product truth.

## Batch 6 Result

Created:

- `docs/current/cycling.md`
- `docs/current/dashboard.md`
- `docs/current/project_links.md`
- `docs/current/traceability.md`
- `docs/future/cycling_next.md`
- `docs/future/dashboard_next.md`

Moved/promoted:

- `docs/vanilla_auth_policy.md` -> `docs/rules/auth_policy.md`
- `docs/schema_api_naming.md` -> `docs/rules/schema_api_naming.md`
- `docs/upload_storage_transition_plan.md` -> `docs/future/upload_storage_transition.md`
- `docs/battery_page_premerge_checklist.md` -> `docs/instructions/battery_premerge_checklist.md`

Archived extracted root sources under:

- `docs/archive/superseded/2026-05-06-root-doc-transition/`

Notable corrections made during extraction:

- Root `docs/` now contains only `README.md` and `INDEX.md`.
- Dashboard and cycling specs were split into current implementation facts and
  future ideas.
- Battery project many-to-many behavior is now documented as current project
  link behavior, not as an implementation plan.
- The upload storage transition remains future work because current `app.js`
  still serves `/uploads` statically.
- Guided battery delete remains intentionally available to any authenticated
  user through the approved delete workflow.

## Batch 7 Result

Audited maintained working docs:

- `docs/current/`
- `docs/rules/`
- `docs/instructions/`
- `docs/future/`
- `docs/README.md`
- `docs/INDEX.md`

Checks completed:

- Markdown links resolve.
- `Source paths` breadcrumbs resolve.
- Required headers are present.
- Stale root-doc references are absent from canonical docs.
- Canonical high-risk claims were spot-checked against code and migrations.

Notable corrections made:

- Smoke post-dump migration docs now name the actual files:
  `d028_tape_projects_many_to_many.sql`,
  `d029_electrode_cut_batch_projects_many_to_many.sql`,
  `d030_battery_projects_many_to_many.sql`, and
  `d031_harden_battery_stack_validate_trigger.sql`.
- Battery stack docs now describe the current trigger-safe paired insert order
  used by `orderStackRowsForInsert()`.
- Auth policy now reflects that vanilla report/read compatibility endpoints are
  authenticated.
- Project-link docs now clarify that legacy `project_id` columns exist on tapes
  and batteries, while electrode cut batch fallback comes from the source tape.
- Capacity formulas now use canonical `specific_capacity_mah_g`.
- Traceability docs now distinguish `routes/activity.js` history reads from
  dashboard activity aggregation.

## Batch 8 Result

Updated the formal `Документация ЕСПД/` mirror from the canonical working docs.

Notable corrections made:

- Source-of-truth wording now points to code, migrations, smoke/contract checks,
  and `docs/current`, `docs/rules`, `docs/instructions`; old notes and generated
  docs are historical context only.
- Pouch/cyl battery stack wording now says the service inserts trigger-safe
  pairs `A1, C1, A2, C2` while preserving original `position_index`.
- Materials docs now reflect instance-level properties and DB-backed material
  attachments.
- Cycling docs now reflect multipart raw-file upload, 100 MB raw-file limit,
  automatic session creation per upload, PNG/CSV/XLSX exports, and no SVG export.
- Dashboard docs now list the current endpoints:
  `/kpi`, `/filter-options`, `/activity`, `/production`, `/graph`, `/funnel`,
  `/materials-usage`.
- Project-link docs now avoid the false `electrode_cut_batches.project_id`
  claim; cut batch fallback comes from the source tape.
- Formal test plan now includes `TK-BAT-10` for cathode-first valid stack
  payloads under d031 and updates the count to 87 tests / 57 critical.

## Suggested Next Action

Run one final documentation review from the diff, then return to release/code
work with `docs/` as the record-keeping layer and `Документация ЕСПД/` as the
formal mirror.
