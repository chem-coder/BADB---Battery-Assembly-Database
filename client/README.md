# BADB Excel Client

DatabaseUI.xlam — Excel add-in for laboratory data entry.
Part of the BADB (Battery Assembly Database) system.

## Overview

Operators use Excel to enter battery production data (tape preparation, electrode cutting, battery assembly, QC results). Data is packaged as JSON and sent to the BADB server (Node.js + PostgreSQL) via HTTP API.

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

## Getting Started

1. Open `template/DatabaseUI_template.xlam` in Excel
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
