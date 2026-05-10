# BADB Excel Client

Status: dormant legacy / preserved historical client material.

`DatabaseUI.xlam` was an Excel add-in concept for laboratory data entry. The
current BADB v1 operating surface is the vanilla web UI in `public/`, with Vue
in `client-web/` for assigned parity work. This `client/` folder is kept for
reference and possible future revival; do not treat it as the current primary
client.

## Historical Overview

The intended Excel flow packaged laboratory data as JSON and sent it to the
BADB server via HTTP API. If this client is revived, verify every route,
contract, auth rule, and workbook assumption against current code first.

## Architecture

```
Ribbon → Router → cmd (UI) → svc (logic) → util (errors, logs)
                                          → cfgApp (config)
                                          → AppContext (session)
```

- **cmd*.bas** — commands with UI (MsgBox/InputBox). Only place for user interaction.
- **svc*.bas** — services with pure logic. No UI allowed.
- **util*.bas** — cross-module utilities (error handling, logging).
- **cfgApp.bas** — all constants (commands, roles, paths, column indices).
- **AppContext.cls** — session state (user, role, authorization).

## Historical Build Notes

These commands describe the old Excel/VBA workflow. They are not part of the
current vanilla release checks.

1. Open `template/DatabaseUI_template.xlam` in Excel if the template exists on
   the branch/workstation.
2. In VBA Editor → Immediate Window:
   ```
   modBuild.Build_Import_All
   ```
3. This imports all source from `src/` into the VBA project

## Build Commands

| Command | What it does |
|---------|-------------|
| `modBuild.Build_Export_All` | Export VBA modules → `src/` |
| `modBuild.Build_Import_All` | Import `src/` → VBA project |
| `modBuild.Build_Make_Addin` | Build DatabaseUI.xlam from template |

## Historical Data Contracts

The old Excel design expected client-local JSON Schema files under
`contracts/schemas/`, but that folder is not present in the current `client/`
tree. Treat those contract references as historical notes.

Before using the Excel client, confirm the relevant current server contracts,
routes, auth requirements, and payload shapes against `BADB_main` code.

## Project Structure

```
├── README.md
├── CLAUDE.md
├── .gitignore
├── src/              Dormant legacy VBA source snapshot
│   ├── classes/      Class modules (.cls)
│   ├── commands/     Command modules (.bas)
│   ├── config/       Configuration modules (.bas)
│   ├── forms/        UserForms (.frm)
│   ├── ribbon/       Ribbon/router modules (.bas)
│   ├── services/     Service modules (.bas)
│   └── utils/        Utility/build modules (.bas)
└── archive/          Previous versions and reference material
```

## Team

- **Dima** — Excel/VBA, architecture, data contracts
- **Dalia** — Server (Node.js + Express + PostgreSQL)
