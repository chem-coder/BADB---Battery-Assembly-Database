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

## Data Contracts

JSON Schema files in `contracts/schemas/` define the format for each data submission type. See `tape_prepare.v1.json` for the first contract.

Before using the Excel client, confirm the relevant contracts still match the
current server behavior.

## Project Structure

```
├── src/              VBA source code
│   ├── classes/      Class modules (.cls)
│   ├── modules/      Standard modules (.bas)
│   └── forms/        UserForms (future)
├── contracts/        Data contracts (JSON Schema)
│   ├── schemas/      Submission type schemas
│   └── enums/        Shared enumerations
├── docs/             Documentation
├── template/         Excel template for building .xlam
├── tests/            Test scripts
└── archive/          Previous versions (reference)
```

## Team

- **Dima** — Excel/VBA, architecture, data contracts
- **Dalya** — Server (Node.js + Express + PostgreSQL)
