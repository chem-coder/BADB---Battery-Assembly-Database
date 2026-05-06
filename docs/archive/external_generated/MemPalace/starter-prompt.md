# Starter prompts for your AI assistant

This file gives you **ready-to-paste prompts** to hand MemPalace setup off to your AI. The prompts work with any MCP-capable agentic CLI — Claude Code, Codex, Cursor, Cline — and there's a fallback for plain ChatGPT.

## Before you paste — pre-flight checks

Run these five commands in your terminal and keep the output on screen. Your AI will ask for them.

```bash
uname -m                              # macOS: arm64 (Apple Silicon) or x86_64 (Intel)
which python3                         # path to your Python
python3 --version                     # should be 3.9+
file $(which python3) 2>/dev/null     # macOS only: "universal" vs "pure arm64" matters
claude --version 2>/dev/null || codex --version 2>/dev/null || echo "neither claude nor codex on PATH"
```

---

## Prompt 1 — Universal prompt for any MCP-capable agentic tool

Works with **Claude Code, Codex, Cursor, Cline**, or any other agentic CLI that supports the Model Context Protocol. Copy-paste everything between the triple backticks into your AI.

```
I want to set up MemPalace (github.com/MemPalace/mempalace) — a local-first semantic-memory tool that stores my AI coding conversations as verbatim drawers in a searchable palace. I want to integrate it with my AI assistant via MCP so I get mempalace_* tools inside every session.

Please read these files in order (adjust the path if the folder landed somewhere other than ~/Documents/Other/GitHub/Фишки/MemPalace or ~/Downloads/MemPalace):

1. INDEX.md — overview and critical rules
2. README.md — full setup guide
3. project-types.md — strategy matrix (only skim, used later)

Key facts about my environment that I'll fill in when you ask:
- My AI tool: [Claude Code / Codex / Cursor / Cline / other]
- My OS and architecture: I'll paste the output of `uname -m`, `which python3`, `python3 --version`, `file $(which python3)`
- My project: I'll tell you the name (for the palace wing) and the path to my AI tool's session transcripts

Walk me through setup in this exact order. Do NOT skip ahead.

**Step 1 — Prerequisites check.** Ask me to paste the pre-flight output from my terminal. From it, determine:
- Which Python interpreter to install mempalace into (typically `/usr/local/bin/python3` for Python.org or `/opt/homebrew/bin/python3` for Homebrew-Apple-Silicon)
- Whether `arch -arm64` wrapper is required (YES if `file` shows "universal binary" on Apple Silicon, NO if pure arm64 Homebrew or on Linux/Intel)
- Whether my AI tool's CLI is actually installed

**Step 2 — Install mempalace.** Run `<my-python> -m pip install --user mempalace`. Verify with `<my-python> -m mempalace status` (prepend `arch -arm64` if needed). Confirm with me before running the install command.

**Step 3 — Register mempalace as an MCP server at USER scope.** This is the tricky step because the registration command depends on which AI tool I use:
- **Claude Code**: `claude mcp add --scope user mempalace -- <python-with-optional-arch> -m mempalace.mcp_server`
- **Codex**: use Codex's MCP registration mechanism. If you don't know it, check `codex --help | grep -i mcp`, `codex mcp --help`, or `~/.codex/` config files. Translate the above command structure to Codex's equivalent.
- **Cursor**: edit `~/.cursor/settings.json` under `mcpServers` key, or use Cursor's Settings UI to add a new MCP server.
- **Cline** (VS Code extension): edit VS Code `settings.json` under `cline.mcpServers`.

In all cases: use USER scope (not project scope), because project scope breaks when I open the tool in a parent folder or share my project with colleagues who don't have mempalace installed. See README §5 for the full explanation.

After registration, verify with the tool's MCP health command (e.g., `claude mcp list`) or equivalent. It should show `mempalace: ✓ Connected`.

**Step 4 — Find my AI's session-history folder and mine it.** Session-history location depends on the tool:
- **Claude Code**: `~/.claude/projects/<project-hash>/` — find via `ls ~/.claude/projects/ | grep -i <my-project-name>`
- **Codex**: `~/.codex/sessions/` or similar — check `ls ~/.codex/` and `ls "~/Library/Application Support/Codex/"`
- **Cursor**: Cursor doesn't export session JSONLs by default; skip mining or ask the user where Cursor logs conversations
- **Cline**: Cline stores conversations in VS Code workspace storage; path depends on VS Code version

Once found, run:
  <python-with-optional-arch> -m mempalace mine <session-folder> --mode convos --wing <my-project-name> --agent <my-nickname>

CRITICAL: use `--mode convos`, never `--mode projects` on a source tree. The default `projects` mode indexes code and can blow up disk to tens of GB. See README §2.

If no session history exists yet (new install), skip mining — the palace will be empty and grow as I use the tool.

**Step 5 — Configure the SessionStart hook.** This is the only hook I want. NOT Stop, NOT PreCompact. The README §7 explains in detail why Stop and PreCompact cause context noise and over-save — they delegate saves to the agent via reminder messages rather than writing directly, which creates per-turn spam and low-signal drawers.

The hook location depends on my tool:
- **Claude Code**: `~/.claude/settings.json` under `hooks.SessionStart`
- **Codex**: find Codex's config file that supports session-start hooks (or document that Codex may not support hook events — in that case skip this step and rely on manual saves)
- **Cursor / Cline**: these tools may not have hook events at all — if not, skip this step

The hook command uses `--harness` to tell mempalace which transcript format to expect:
- For Claude Code: `--harness claude-code`
- For Codex: `--harness codex`

Example for Claude Code on Apple Silicon:

    {
      "hooks": {
        "SessionStart": [
          {
            "matcher": "*",
            "hooks": [
              {
                "type": "command",
                "command": "arch -arm64 /usr/local/bin/python3 -m mempalace hook run --hook session-start --harness claude-code",
                "timeout": 30
              }
            ]
          }
        ]
      }
    }

Adapt: drop `arch -arm64` if not needed, change `claude-code` to `codex`, adjust python path. Show me the exact diff before editing.

**Step 6 — Verify end-to-end.** Run these checks and tell me what the output means:
- `<python> -m mempalace status` — should show wings and drawer counts
- `<python> -m mempalace search "any phrase you remember"` — should return results (or "no matches" if palace is empty)
- Tool's MCP health command — should show mempalace Connected
- Restart the AI tool. Open a fresh session. Confirm mempalace_* tools are available in the new session.

Rules for the walkthrough:

- Before running any install / config-edit command, show it to me and wait for confirmation.
- Before editing any config file, back it up first (e.g., `cp ~/.claude/settings.json ~/.claude/settings.json.bak`).
- After each step, run a quick verification. Don't move on until it passes.
- Ask me one question at a time when you need info (project name, nickname, Python path). Don't front-load 10 questions.
- If README and upstream MemPalace docs (github.com/MemPalace/mempalace) disagree on hooks or mining, trust THIS README — it has corrections from real setup experience.
- If a step fails, diagnose from README §10 Troubleshooting before asking me for more info.

Start by reading INDEX.md, giving me a one-sentence summary, and then asking me for the pre-flight check output.
```

---

## Prompt 2 — ChatGPT web fallback (no MCP)

ChatGPT (the web/mobile app at chat.openai.com) does **not** support MCP. If you're using ChatGPT this way, MemPalace can still help — but only via CLI, without in-chat tools.

Your workflow would be:
1. Install mempalace via terminal
2. Mine any existing conversation exports you have (ChatGPT export, Claude export, etc.)
3. Run `mempalace search` in your terminal when you need past context
4. Copy/paste search results into ChatGPT manually

If that's acceptable, copy-paste this to ChatGPT:

```
I'm installing MemPalace, a local semantic-memory CLI tool, on my Mac. ChatGPT doesn't support MCP, so I'll use MemPalace as a pure command-line tool and paste relevant results into our conversations when I need context from past sessions.

Help me execute setup step by step. I'll paste sections of the guide as we go.

My environment:
- Mac: <Apple Silicon M1 Pro | Intel | other>
- Python: I'll paste `which python3 && python3 --version && file $(which python3)` when you ask
- No MCP-capable AI tool currently

First section of the guide (the TL;DR):

[PASTE THE §0 TL;DR BLOCK FROM README.MD HERE]

Prerequisites section:

[PASTE §3 FROM README.MD HERE]

Walkthrough rules:
- Explain each command before I run it
- Tell me to expect errors on Apple Silicon if I don't prefix with `arch -arm64` and my Python is a universal binary
- Skip anything related to MCP registration (§5 of the README) — I'll run mempalace as a standalone CLI only
- Skip hooks (§7) — those require an MCP-capable tool
- Focus on: install (§4), mining (§6 with --mode convos), and daily CLI usage (§8 commands)

Start by asking me to paste the output of `uname -m && which python3 && python3 --version && file $(which python3)`.
```

If you decide later you want in-chat mempalace tools, switch to an MCP-capable tool (Cursor, Cline, Codex, Claude Code) and re-run Prompt 1 from this file. Your existing `~/.mempalace/` palace content carries over — nothing is lost.

---

## Tool-specific quick notes

### Claude Code (the guide's primary reference)
Everything in README.md works as-is. The commands `claude mcp add`, `claude mcp list`, the settings file `~/.claude/settings.json` — all native. Prompt 1 walks you through it without translation.

### Codex
Supported. MemPalace has `--harness codex` for its hook system. MCP registration uses Codex's own mechanism (not `claude mcp add`) — check `codex mcp --help` or `~/.codex/` config files. The AI following Prompt 1 will figure this out.

### Cursor
Supported for MCP (as of late 2024). Edit `~/.cursor/settings.json` under `mcpServers`, or use Cursor's Settings → MCP Servers UI. Cursor may not have hook events equivalent to Claude Code — if not, skip Step 5 (SessionStart hook) and rely on manual saves.

### Cline (VS Code extension)
Supported for MCP. Edit VS Code `settings.json` under `cline.mcpServers`. Like Cursor, may not have hook events. Skip Step 5 if not.

### GitHub Copilot
Not supported. Copilot doesn't implement MCP. Use Prompt 2 (CLI-only) if Copilot is your primary tool.

### Other agentic CLIs (Aider, Goose, custom wrappers)
If the tool supports MCP (via `--config` file, `--mcp-server` flag, or similar), it can use mempalace. Have the AI figure out the registration command from the tool's own docs. The concepts from Prompt 1 apply regardless.

---

## Non-negotiable rules

Regardless of which tool or prompt you use:

1. **Never mine source code** (`--mode projects` on a source tree). Use `--mode convos` only, and point it at your AI tool's conversation history folder. See README §2 for why this matters.

2. **USER scope for MCP registration**, not project scope. Project-level `.mcp.json` files break when you open the tool in a parent directory or when you share the project with colleagues who don't have mempalace.

3. **SessionStart hook only.** No Stop, no PreCompact. README §7 explains the delegate-to-agent pattern that makes those two hooks produce context noise and low-signal drawers.

4. **macOS Apple Silicon gotcha:** if `file $(which python3)` shows "universal binary" in its output, every `python3 -m mempalace ...` command must be prefixed with `arch -arm64`. Otherwise you get `dlopen` errors about numpy architecture mismatch. See README §3.

5. **Manual checkpoint saves** at natural boundaries, not auto-save on every turn. At the end of a feature, bug fix, or significant decision, ask your AI: "save this session to MemPalace as a diary entry, topic X". See README §7 and §8 for the pattern.

6. **Verify after every step.** Don't assume success from exit code 0. Run `mempalace status` after mining, `mempalace search "known phrase"` after mining, the tool's MCP health check after registration, and confirm `mempalace_*` tools appear in a fresh session.

---

## If something goes wrong

Common symptoms and where they're diagnosed in README.md:

| Symptom | README section |
|---------|----------------|
| `No module named mempalace` | §10 — wrong Python interpreter |
| `dlopen ... arm64 ... x86_64` | §10 — Apple Silicon arch mismatch, need `arch -arm64` |
| `mempalace_*` tools missing in session | §5, §10 — MCP registration or restart |
| `~/.mempalace/` tens of GB | §10 — accidental `--mode projects`, reset |
| Search returns nothing | §10 — content not mined yet or wing filter too narrow |
| Hook spams context with "AUTO-SAVE checkpoint" | §7 — remove Stop/PreCompact hooks, keep SessionStart only |

If your AI hits an error it can't recover from, screenshot or copy the last few commands + error message and share with the person who gave you this folder.
