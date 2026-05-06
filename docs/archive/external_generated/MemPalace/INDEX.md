# MemPalace — Setup Guide Index

This folder is an **objective, practical setup guide for MemPalace** (`github.com/MemPalace/mempalace`), a local-first semantic memory system for Claude Code and similar AI assistants.

It is written to be read by **two audiences simultaneously**:
1. **Human developers** who want to install and use MemPalace on their own machine
2. **Claude Code agents** who need to understand MemPalace to help their user set it up or use it

Both audiences benefit from the same content — read top to bottom.

## Files

| File | Purpose | Read when |
|------|---------|-----------|
| `README.md` | Full setup guide: install, MCP registration, mining, hooks, daily usage, maintenance, troubleshooting, lessons learned. Claude-Code-centric but concepts transfer to any MCP-compatible tool. | **Start here** if you're setting it up yourself. |
| `starter-prompt.md` | Ready-to-paste prompt for your AI assistant (Codex, Cursor, Cline, Claude Code) so it walks you through setup from this folder. Also covers a fallback for ChatGPT-web users. | **Start here** if you want your AI to do the setup for you. |
| `project-types.md` | Strategy matrix for 6 project types (software / monorepo / research / ops / consultancy / personal KM) — what to mine, wing/room structure, knowledge graph patterns | After setup, when deciding how to structure your palace for your specific kind of project |
| `INDEX.md` | This file — entry point and pointers | Now |

## How to use this folder

### Fastest path — let your AI do the setup

1. Open `starter-prompt.md` — pick the prompt for your AI tool (Codex, Cursor, Cline, Claude Code, or ChatGPT fallback).
2. Copy-paste the prompt into your AI.
3. Follow along as the AI walks you through install, mining, and hook configuration.
4. The AI will translate Claude-Code-specific commands (`claude mcp add`) into whatever your actual tool needs.

### Alternative — manual setup

1. Read `README.md` top to bottom (§0 gives a TL;DR).
2. Apply the install + MCP + mining steps in order.
3. Configure **only the SessionStart hook** per §7. Do not configure Stop or PreCompact hooks.
4. Verify: the MCP list command for your tool should show `mempalace: ✓ Connected`, and `mempalace status` should show drawers after first mining.
5. Bookmark `project-types.md` as reference for room/wing structure ideas.

### If you are a Claude Code agent helping a user set up MemPalace

1. Read `README.md` completely (especially §7 — the hooks story is non-obvious and commonly gotten wrong by other guides).
2. Determine the user's project type from context, or ask via AskUserQuestion. Map it to a section in `project-types.md`.
3. Execute the install + MCP registration + conversation mining for the user.
4. Configure the SessionStart hook in their `~/.claude/settings.json` (adapt the snippet in §7).
5. Verify end-to-end: health check MCP, test search, confirm the user can open a new Claude Code session and see `mempalace_*` tools.
6. Optionally: populate the knowledge graph with a few starting entities (user name, project name, key subsystems, main collaborators) — see README §8.

### If you are sharing this with a colleague

Just send them the folder path. `README.md` is self-contained and has a TL;DR at the top (§0) for fast setup, followed by detailed sections for each step. Every command in the README is copy-pasteable with placeholders for project-specific values.

## Critical rules (applies to everyone)

These are the rules that separate a useful MemPalace setup from a broken one. They are explained in detail in `README.md` but summarized here for quick reference:

1. **Never mine source code.** Use `--mode convos` on Claude Code session history, not `--mode projects` on a source tree. Mining source trees produces tens of GB of useless vector data and degrades search.

2. **Never skip `arch -arm64` on Apple Silicon.** The universal `python3` binary may launch in x86_64 mode, which breaks numpy. Always prefix mempalace commands with `arch -arm64` on macOS M-series machines.

3. **Use USER scope for MCP registration.** `claude mcp add --scope user mempalace -- ...` works from any folder. Project-scope `.mcp.json` breaks when the user opens Claude Code in a parent directory.

4. **Configure only SessionStart hook.** Not Stop, not PreCompact. See README §7 for the full explanation — short version: Stop and PreCompact hooks delegate saves to the agent via context-polluting reminders, not automatic writes. SessionStart injects wake-up context cleanly.

5. **Save manually at natural checkpoints.** After the end of a feature, a bug fix, or a session, ask Claude to write a diary entry or add a drawer. This gives high-signal drawers instead of the noisy per-turn auto-save that Stop hook would produce.

6. **Never skip verification.** Run `mempalace_search` with a query you know should match your history, immediately after mining. Don't assume exit code 0 means success.

## Quick start (for humans who trust this guide)

```bash
# 1. Install
/usr/local/bin/python3 -m pip install --user mempalace

# 2. Register as MCP (macOS Apple Silicon — drop `arch -arm64` on other platforms)
claude mcp add --scope user mempalace -- \
  arch -arm64 /usr/local/bin/python3 -m mempalace.mcp_server

# 3. Mine conversation history (find your project's Claude Code folder first)
ls ~/.claude/projects/
arch -arm64 /usr/local/bin/python3 -m mempalace mine \
  ~/.claude/projects/<your-project-hash>/ \
  --mode convos --wing MyProject --agent yourname

# 4. Edit ~/.claude/settings.json — add SessionStart hook (full JSON in README §7)

# 5. Verify
claude mcp list
arch -arm64 /usr/local/bin/python3 -m mempalace status
arch -arm64 /usr/local/bin/python3 -m mempalace search "any phrase you remember from a session"

# 6. Restart Claude Code, check mempalace_* tools are available
```

If any step fails, open `README.md` at the corresponding section.

## What NOT to do

1. Do **not** run `mempalace init <project-dir>`. It generates an anti-pattern `mempalace.yaml` and tempts you to mine source code.
2. Do **not** mine the parent folder of your whole workspace. Mine one Claude Code project folder at a time.
3. Do **not** configure the Stop hook. It floods every Claude turn with "AUTO-SAVE checkpoint" reminders and over-saves low-signal content.
4. Do **not** configure the PreCompact hook unless you have very long sessions. For short tasks it never fires.
5. Do **not** commit `mempalace.yaml`, `entities.json`, or anything under `~/.mempalace/` to git. This is personal local memory. Add to `.gitignore` if it ends up in your project directory.
6. Do **not** expect the palace to contain your latest session automatically. Either call `mempalace_diary_write` manually when something is worth saving, or re-run `mempalace mine --mode convos` periodically.

## Scam warning

From the upstream MemPalace README: the only official sources are
- `github.com/MemPalace/mempalace`
- `pypi.org/project/mempalace`
- `mempalaceofficial.com`

Do not install from alternative domains (including `mempalace.tech`) — they may be malware impostors.

---

## One-line summary for LLMs

> MemPalace = local verbatim store for conversation history and decisions, NOT for code. Mine with `--mode convos` only. Use USER-scope MCP registration. Configure ONLY the SessionStart hook. Save explicitly via `mempalace_diary_write` at natural checkpoints. On macOS Apple Silicon always prepend `arch -arm64`. Full guide: `README.md` in this folder.
