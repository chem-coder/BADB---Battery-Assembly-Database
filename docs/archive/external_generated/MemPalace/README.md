# MemPalace Setup Guide for Claude Code

**Audience:** Developers who want long-term, searchable memory across their Claude Code sessions.

**What you get:**
- Verbatim storage of all your Claude Code conversations, queryable by semantic search
- Local-only (no cloud, no accounts, no API keys)
- Temporal knowledge graph for facts that change over time (ownership, decisions, status)
- MCP integration — Claude Code sees 29 `mempalace_*` tools inside every session
- Automatic wake-up context at the start of each new session

**What you do not get:**
- Automatic code indexing (and you do not want this — see §2)
- Team-shared memory (it's local; use git/wiki/Notion for team knowledge)
- A replacement for CLAUDE.md or memory/*.md files (different layers — see §11)

---

## 0. TL;DR for the impatient

```bash
# 1. Install into the Python that owns /usr/local/bin/python3 (or equivalent on your platform)
/usr/local/bin/python3 -m pip install --user mempalace

# 2. Register as a Claude Code MCP server at USER scope (not project scope)
claude mcp add --scope user mempalace -- /usr/local/bin/python3 -m mempalace.mcp_server
# macOS Apple Silicon note: prepend `arch -arm64` if python3 is a universal binary
# claude mcp add --scope user mempalace -- arch -arm64 /usr/local/bin/python3 -m mempalace.mcp_server

# 3. Mine your existing Claude Code conversation history into the palace
/usr/local/bin/python3 -m mempalace mine \
  ~/.claude/projects/<your-project-hash>/ \
  --mode convos \
  --wing <YourProjectName> \
  --agent <your-name>

# 4. Configure ONE hook (SessionStart only — see §7 for why not Stop/PreCompact)
# Edit ~/.claude/settings.json — add the SessionStart hook (full JSON in §7).

# 5. Verify
/usr/local/bin/python3 -m mempalace status
claude mcp list | grep mempalace

# 6. Restart Claude Code and check that mempalace_* tools are available
```

If each of those commands completes cleanly, you are done. Skip to §8 (daily usage).

If any step fails, read the corresponding section below.

---

## 1. What MemPalace is (factually)

From the official README at `github.com/MemPalace/mempalace`:

- **Local-first AI memory.** Storage lives in `~/.mempalace/` on your machine. No data leaves your machine unless you opt in.
- **Verbatim storage.** Stores original text as-is — no summarization, no extraction, no paraphrasing.
- **Structured hierarchy:** `wings` (people/projects) → `rooms` (topics within a wing) → `drawers` (verbatim content units).
- **Semantic search** via ChromaDB by default (pluggable). The default embedding model is bundled (~300 MB on disk).
- **Temporal knowledge graph** with validity windows, stored in local SQLite. Entities, relationships, time bounds.
- **29 MCP tools** accessible from Claude Code with the `mcp__mempalace__` prefix.
- **Retrieval benchmarks:** 96.6% R@5 on LongMemEval raw (no LLM at retrieval time). Details in the upstream repo.

**What MemPalace is NOT:**
- Not a replacement for `grep` / LSP / IDE navigation on code. Searching source code through a vector store is slower and less precise than `ripgrep` + `Read`.
- Not a team knowledge base. Everything is local per-machine. Use it for your Claude sessions, not for documentation your team needs.
- Not a replacement for `CLAUDE.md`. `CLAUDE.md` is project rules, loaded at every session start. MemPalace is verbatim history, searched on demand.

---

## 2. The golden rule — what NOT to mine

This is the one rule that separates a useful palace from a 50 GB disaster:

**Mine conversations. Do not mine source code.**

MemPalace has two mining modes:
- `--mode convos` — mines conversation exports (Claude Code JSONL transcripts, ChatGPT exports, etc.). **This is what you want.**
- `--mode projects` — the default. Mines every file in a directory tree. Intended for documentation-heavy folders. **Do not aim it at a source tree.**

If you run `mempalace mine ~/projects/my_app` on a typical software repo:
- It walks the file tree (respecting `.gitignore` — but your `.gitignore` probably does not exclude `src/`)
- It chunks every `.js`, `.vue`, `.py`, `.go`, `.ts` into drawers
- It computes embeddings for every chunk
- It stores both the verbatim chunk and the embedding

A medium project with ~10 000 files quickly produces millions of chunks and tens of GB of vectors. One of us (Dima, BADB project) hit exactly this and had to rebuild the palace from scratch after the initial install.

**The code you are working on is already indexed — by your filesystem.** `grep`, `ripgrep`, and Claude Code's `Glob` / `Grep` / `Read` tools traverse it in milliseconds. A vector index buys you nothing on top.

**What to mine instead:**
1. Claude Code conversation history: `~/.claude/projects/<project-hash>/` — primary use case
2. Markdown docs and decision records (optional, see §6)
3. Meeting notes, research notes, post-mortems (optional)

Everything else — source code, dependencies, build artifacts, database dumps, binaries — stays out.

---

## 3. Prerequisites

- **Python 3.9+** — whatever version you choose must be the one you install MemPalace into, the one the MCP server runs from, and the one the hook script invokes. Mixing interpreters is the number-one cause of "mempalace not found" errors (see §10).
- **`pip` for that Python.** On macOS Python.org installs, it ships with pip. On system Python (Apple-shipped `/usr/bin/python3`), pip may be missing; use Homebrew or Python.org instead.
- **Claude Code 2.x** — `claude --version` must return 2.0 or later. Required for `claude mcp add --scope user`.
- **~500 MB of free disk** for the default embedding model and ChromaDB store. Final palace size depends on how much conversation history you mine — typically 50–500 MB for one project.
- **No API key required.** MemPalace does not call any cloud service by default.

### macOS Apple Silicon gotcha

If you are on M-series Mac, **check which architecture your `python3` runs as**:

```bash
python3 -c "import platform; print(platform.machine())"
file $(which python3)
```

The `file` command should show `arm64` (or `arm64e`). If it shows `x86_64 + arm64` (universal binary), beware: **macOS may launch it under x86_64 depending on parent process**, which breaks numpy when numpy was installed as arm64.

The symptom: `dlopen` error complaining about `(have 'arm64', need 'x86_64')` or vice versa when mempalace tries to import numpy.

The fix: **always prepend `arch -arm64`** to commands that invoke `python3 -m mempalace ...`. You will see this in every command in §4 and later.

Linux and Windows users can skip this. You also should not need it on Intel Macs.

---

## 4. Install

### Step 4.1 — Install mempalace into the right Python

```bash
# macOS (Apple Silicon or Intel)
/usr/local/bin/python3 -m pip install --user mempalace

# Linux (adapt to your pip3)
python3 -m pip install --user mempalace

# Windows PowerShell
py -3 -m pip install --user mempalace
```

**Verify the install is in the Python you expect:**

```bash
/usr/local/bin/python3 -m mempalace --help | head -5
```

You should see usage information. If you get `No module named mempalace`, you installed into a different interpreter — check with `pip3 show mempalace` and see the `Location:` line.

### Step 4.2 — First run, check palace bootstrap

```bash
# macOS Apple Silicon: prepend `arch -arm64`
arch -arm64 /usr/local/bin/python3 -m mempalace status
```

First run creates `~/.mempalace/` with:
- `config.json` — palace-level configuration
- `palace/` — ChromaDB store (empty at this point)
- `knowledge_graph.sqlite3` — temporal KG database (empty)

You should see something like:

```
=======================================================
  MemPalace Status — 0 drawers
=======================================================
```

If this fails with an architecture mismatch error, re-read §3 and add `arch -arm64` in front.

### Step 4.3 — Create an identity file (optional but recommended)

```bash
cat > ~/.mempalace/identity.txt <<'EOF'
<your-name> — <role> on <project-name>.
Stack: <your-stack>.
Main working directory: /path/to/your/project.
EOF
```

This is loaded as L0 (identity) context in the wake-up response. It helps the palace protocol present you consistently across sessions.

---

## 5. Register mempalace as a Claude Code MCP server

### Use USER scope, not project scope

Claude Code's `.mcp.json` (project-level file) is tempting but has two problems:
1. If you open Claude Code in a parent directory or sibling, the project-level config is not loaded, and mempalace is invisible.
2. If your project has multiple contributors, committing a personal tool's config affects everyone — others hit startup errors because they don't have mempalace installed.

Use user scope instead. It lives in `~/.claude.json` and follows you regardless of where you open Claude Code.

### Step 5.1 — Register

```bash
# Linux / Intel Mac / Windows
claude mcp add --scope user mempalace -- /usr/local/bin/python3 -m mempalace.mcp_server

# macOS Apple Silicon
claude mcp add --scope user mempalace -- arch -arm64 /usr/local/bin/python3 -m mempalace.mcp_server
```

Output should include:

```
Added stdio MCP server mempalace with command: ... to user config
File modified: ~/.claude.json
```

### Step 5.2 — Health check

```bash
claude mcp list
```

Expected output:

```
mempalace: arch -arm64 /usr/local/bin/python3 -m mempalace.mcp_server - ✓ Connected
```

`✓ Connected` means Claude Code successfully spawned the server and received an `initialize` response over stdio. If it says `✗ Failed` or times out, check:
- Python interpreter path is correct
- mempalace is installed into that interpreter (§4.1)
- On macOS: `arch -arm64` is present if needed (§3)

### Step 5.3 — Verify inside a Claude Code session

Start a fresh Claude Code session. Ask Claude to list available tools, or run any tool with the `mcp__mempalace__` prefix. The 29 mempalace tools should be available.

If they are not, the session was started before the registration took effect. **Restart Claude Code.**

---

## 6. First mining — conversations only

### Step 6.1 — Find your Claude Code session history folder

Claude Code stores every session as JSONL under `~/.claude/projects/`. The folder names are hash-encoded project paths:

```bash
ls ~/.claude/projects/
```

Find the folder that corresponds to your project. For a project at `~/Work/MyApp`, it's typically `-Users-<you>-Work-MyApp` or similar.

```bash
ls ~/.claude/projects/ | grep -i myapp
```

### Step 6.2 — Mine the session history

```bash
arch -arm64 /usr/local/bin/python3 -m mempalace mine \
  ~/.claude/projects/<your-project-hash>/ \
  --mode convos \
  --wing MyApp \
  --agent yourname
```

Parameters:
- **First positional arg** — directory to mine. Point it at the folder with `.jsonl` session files.
- **`--mode convos`** — conversation mining, not project files. This is critical.
- **`--wing MyApp`** — the wing name where drawers will be filed. Use your project name. Use exactly one wing per project.
- **`--agent yourname`** — recorded on every drawer as provenance. Use your username or a nickname.

Expected output:

```
MemPalace Mine — Conversations
  Wing:    MyApp
  Source:  /Users/you/.claude/projects/-Users-you-Work-MyApp
  Files:   57
  Palace:  /Users/you/.mempalace/palace

  ✓ [   1/57] session-abc.jsonl  +42
  ✓ [   2/57] session-def.jsonl  +18
  ...

  Files processed: 57
  Drawers filed: 2134

  By room:
    technical    38 files
    architecture 12 files
    problems      4 files
    decisions     3 files
```

MemPalace auto-classifies each session into semantic rooms (`technical`, `architecture`, `problems`, `decisions`, `general`) based on content. You do **not** create rooms manually — the classifier does it.

### Step 6.3 — Check palace size

```bash
du -sh ~/.mempalace/
```

A typical project with a few dozen sessions lands around 30–100 MB. If you see > 1 GB, something went wrong (probably `--mode projects` or wrong source path). See §10 troubleshooting.

### Step 6.4 — Test search

```bash
arch -arm64 /usr/local/bin/python3 -m mempalace search "a phrase you remember from a past session"
```

You should see semantic results, each with source file and similarity score.

### Step 6.5 — Optional: mine markdown docs

If your project has `docs/` or `memory/*.md` files with design decisions, ADRs, or meeting notes, you can mine those too. But:

- **Do not use `mempalace init`** — it autogenerates a `mempalace.yaml` with folder-based rooms (anti-pattern).
- **Do not aim `mempalace mine` at your project root in `projects` mode** — it will suck in source files you don't want.
- **Do aim it at a narrow subfolder** like `docs/` specifically.

```bash
arch -arm64 /usr/local/bin/python3 -m mempalace mine \
  ~/Work/MyApp/docs/ \
  --mode projects \
  --wing MyApp \
  --agent yourname
```

Note: `projects` mode requires a `mempalace.yaml` in the target directory (a quirk of v3.3). If you don't want to deal with that, skip this step — conversation mining alone is already the primary value.

---

## 7. Hooks — the truth about auto-save

**This is the section most guides get wrong. Read it carefully.**

### What people think hooks do

The intuition from the upstream README is: "hooks automatically save your session into the palace, so you don't have to do anything." Two hooks are suggested: `PreCompact` (save before Claude Code compacts context) and `Stop` (save at turn end).

### What the hooks actually do in MemPalace 3.3

The `Stop` hook does **not** save on its own. Instead, it:
1. Reads the session transcript (via the `transcript_path` that Claude Code passes in the hook input JSON)
2. Decides whether the latest turn has save-worthy content
3. **Returns a prescriptive instruction to the agent via a blocking error**: *"AUTO-SAVE checkpoint. Call `mempalace_diary_write`, `mempalace_add_drawer`, `mempalace_kg_add` with the following content..."*
4. The agent (Claude) sees that instruction in context and is expected to respond by calling those MCP tools

This is a **delegated save pattern**, not an automatic save. The hook is a reminder-to-the-agent, not a writer-to-the-palace.

### Why this creates problems

**Problem 1 — Context noise.** Claude Code fires the `Stop` hook after every single agent turn, not just at session end. So with the recommended config, Claude sees the "AUTO-SAVE checkpoint" reminder in its own context on every turn — even turns that contain nothing worth saving (quick status checks, one-line confirmations, simple acknowledgements). In a 30-turn session that's 3000–6000 tokens of repeated prescriptive instruction.

**Problem 2 — Over-save.** Because the agent is obedient, it writes a diary entry every turn. Most turns don't have substance worth diarizing, so the palace accumulates low-signal drawers. Search quality degrades as you add noise.

**Problem 3 — Prompt injection surface.** The hook instruction arrives in the agent's context as a tool-result block. Per Claude's security rules, that's untrusted content. The hook's text includes prescriptive directives like *"Do NOT write to Claude Code's native auto-memory (.md files)"* which are MemPalace-philosophy opinions, not safety-critical commands. The agent has to evaluate and filter each one.

**Problem 4 — False guarantee.** Users think "my session is saved after every turn", but actually saves only happen if the agent obeys the instruction. An agent with limited context or a different task focus may skip the save, and the session is lost.

**Problem 5 — `PreCompact` is unreliable.** Short sessions never trigger compaction. You can work through 20 exchanges and never fire `PreCompact`, meaning "save at PreCompact" saves nothing.

### The recommended configuration — SessionStart only

Instead of `Stop` + `PreCompact`, configure **one** hook: `SessionStart`. It fires once per new session, loads palace context, and has no per-turn noise.

Edit `~/.claude/settings.json` to look like this (preserving any existing hooks you already have in other event types):

```json
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
```

Drop the `arch -arm64` prefix on Linux/Intel Mac/Windows. Keep it on Apple Silicon.

**What this gives you:**
- At the start of every new Claude Code session, MemPalace injects a wake-up context (L0 identity + L1 essential story, ~600–900 tokens) into the session. Claude starts each session already aware of what matters.
- No per-turn context noise.
- No delegated-save pattern.
- No false guarantee.

### How do saves actually happen then?

**Manually, at natural checkpoints, by asking Claude to save.**

Natural checkpoints:
- After a significant implementation is done and verified
- After a difficult bug has been understood and fixed
- At the end of a session, when a major task is completed
- After a design decision has been made and documented
- When a non-obvious fact is established that you want to remember

At each checkpoint, say something like:

> "Save this to MemPalace as a diary entry in AAAK format, topic 'auth-jwt-migration'."
> or
> "Add a drawer in the decisions room with the rationale for choosing dependsOn over showIf."
> or
> "Add to the knowledge graph: I own the auth subsystem, valid from 2026-03-01."

Claude can call `mempalace_diary_write`, `mempalace_add_drawer`, or `mempalace_kg_add` directly on your instruction. This gives you:
- **High-signal drawers.** Only things that matter are saved.
- **Explicit control.** You decide what becomes long-term memory.
- **Zero context pollution.** No repeated reminders.
- **No mystery.** You know exactly what was saved and what wasn't.

### If you want re-mining of session history

For a periodic "catch-up" of the most recent conversation JSONL files (in case you forgot to save anything explicitly), run this as a cron job or daily manual:

```bash
arch -arm64 /usr/local/bin/python3 -m mempalace mine \
  ~/.claude/projects/<your-project-hash>/ \
  --mode convos --wing MyApp --agent yourname
```

It auto-skips already-filed sessions. Running it once a day gives you a safety net for the "I forgot to save" case, without the per-turn hook noise.

---

## 8. Daily usage workflow

### Start of session
1. Open Claude Code in your project directory.
2. `SessionStart` hook fires, mempalace injects wake-up context automatically.
3. Claude now has palace awareness out of the box.

### Mid-session — searching history
When you're stuck on something and want to know what was discussed before:

> "Search MemPalace for 'form factor cascade decision' in the MyApp wing."

Claude calls `mempalace_search`, returns verbatim passages from past sessions.

### Mid-session — checking facts
When you need to verify who owns what, when a change happened, or what the current state of an entity is:

> "Query the knowledge graph for MyApp and show me everything."

Claude calls `mempalace_kg_query` with `entity=MyApp`, returns all current facts.

### End of major task — manual checkpoint
After finishing a significant piece of work:

> "Write a diary entry for today's session in AAAK format. Include the commits, the decisions, and what I learned."

Claude calls `mempalace_diary_write` with a structured entry. This is the save that matters.

### Adding durable facts
When a fact is established that should persist across sessions:

> "Add to the KG: Alice owns the billing service, valid from 2026-03-01."
> "Add: (Stripe) --[replaced]--> (Braintree), valid from 2026-02-15."

Claude calls `mempalace_kg_add`.

### When facts change
> "Mark (Alice) --[owns]--> (Billing) as expired as of today. Then add (Bob) --[owns]--> (Billing), valid from today."

Claude calls `mempalace_kg_invalidate` + `mempalace_kg_add`.

---

## 9. Maintenance

### Weekly — check palace size

```bash
du -sh ~/.mempalace/
```

Should grow by MB per week, not by GB. If size explodes, check whether you accidentally ran `mempalace mine` in `projects` mode on a source tree. Recover by deleting the bad wing (`mempalace_delete_drawer` in bulk is not ideal — for major mistakes, back up `~/.mempalace/`, then `rm -rf ~/.mempalace/`, re-init).

### Periodically — re-mine conversations

If you rely on conversation history (instead of only manual checkpoints), run the mine command once a week or once a month:

```bash
arch -arm64 /usr/local/bin/python3 -m mempalace mine \
  ~/.claude/projects/<project-hash>/ --mode convos --wing MyApp --agent yourname
```

Already-indexed sessions are skipped automatically.

### On corruption — repair

If mempalace starts segfaulting or returning nonsense:

```bash
arch -arm64 /usr/local/bin/python3 -m mempalace repair
```

This rebuilds the ChromaDB vector index from stored drawers without losing data.

### Exporting / backing up

The entire palace is in `~/.mempalace/`. Back it up with `rsync` or `tar`:

```bash
tar -czf mempalace-backup-$(date +%F).tar.gz ~/.mempalace/
```

---

## 10. Troubleshooting

### `mempalace_*` tools don't appear in Claude Code

1. `claude mcp list` — is mempalace listed and `✓ Connected`?
2. If Listed but Failed: run the raw command manually to see the error:
   ```bash
   arch -arm64 /usr/local/bin/python3 -m mempalace.mcp_server
   ```
   It should print "MemPalace MCP Server starting..." and then block on stdin. Ctrl-C to exit.
3. If not listed at all: re-run `claude mcp add --scope user mempalace -- ...` (see §5.1).
4. **Restart Claude Code.** Registration does not take effect in a running session.

### `ImportError: ... have 'arm64', need 'x86_64'` (or vice versa)

- macOS Apple Silicon. `python3` is running under the wrong architecture for your installed numpy.
- Fix: prepend `arch -arm64` to every mempalace invocation (CLI, MCP config, hooks).
- Verify: `python3 -c "import platform; print(platform.machine())"` should match your machine architecture.

### `No module named mempalace`

- You installed mempalace into a different Python than the one your CLI/MCP uses.
- Find the install location: `pip3 show mempalace | grep Location`.
- Match it to the interpreter you invoke: `which python3` and `file $(which python3)`.
- If they mismatch, reinstall into the intended interpreter: `/path/to/intended/python3 -m pip install --user mempalace`.

### `~/.mempalace/` is tens of GB

- You ran `mempalace mine` against a source tree in `projects` mode (default).
- Back up the palace if you have important content, then reset:
  ```bash
  mv ~/.mempalace ~/.mempalace.bad
  ```
- Re-init and mine **only conversations** this time (§6).

### Search returns nothing relevant

- The content may not be mined yet. Your latest session is only saved when either (a) a hook fires and the agent obeys, or (b) you re-run `mempalace mine ... --mode convos` explicitly.
- Try `mempalace_list_wings` and `mempalace_list_rooms` to confirm content exists at all.
- Check if the wing filter is too narrow. `mempalace_search` with no `wing` filter searches all wings.

### `mempalace.yaml` appeared in my project directory

- You (or someone) ran `mempalace init <project-directory>`. It auto-generates this file. It's useless for conversation mining and sets up anti-pattern rooms.
- Safe to delete or rename to `.old`. Add to `.gitignore` if your project tracks it.

### Stop hook reminders flood my context

- You configured `Stop` hook for mempalace. Remove it (§7). Use `SessionStart` only and save manually at checkpoints.

---

## 11. How MemPalace fits with other memory layers

You probably already have other context systems. Here's how to think about them together:

| Layer | Medium | Lifetime | Loaded when? | Use for |
|-------|--------|----------|--------------|---------|
| 1. CLAUDE.md | Markdown in repo | Project lifetime | Start of every session | Invariants, commands, team-wide rules |
| 2. `~/.claude/projects/<id>/memory/*.md` | Auto-injected markdown | Weeks to months | Start of every session | Topic-specific notes, recent decisions |
| 3. MemPalace drawers | ChromaDB + verbatim | Years | On demand (search) | Verbatim history, decisions, rationale |
| 4. MemPalace knowledge graph | SQLite temporal graph | Years | On demand (query) | Entities, ownership, state over time |
| 5. Grep / Read / Glob | Source code | Live | On demand | Current code state — "what is" |

**Rule of thumb:**
- Always-need-to-know → CLAUDE.md
- Sometimes-inject → memory/*.md
- Must-be-findable → MemPalace drawers
- Temporal entities → MemPalace KG
- Current code → filesystem tools (grep/read)

MemPalace does not replace CLAUDE.md. CLAUDE.md tells Claude what is true right now. MemPalace tells Claude what was discussed, decided, and learned over time.

---

## 12. The lessons learned (hard way)

These come from real experience setting up MemPalace for a production Vue/Node project (BADB, ~2 developers, ~80 MB source, 6000+ conversation drawers after mining). Written down here so you can skip the mistakes.

1. **Never mine source code.** The first install was aimed at the project root in `projects` mode. Result: tens of GB in `~/.mempalace/`, search quality dropped because results were dominated by code chunks instead of discussions. Recovery: nuke palace, re-mine conversations only.

2. **Pick ONE Python and stick with it.** Apple ships Python 3.9 in `/usr/bin/python3`. Python.org ships 3.12 in `/usr/local/bin/python3`. Homebrew ships 3.14 in `/opt/homebrew/bin/python3`. Each has its own user site-packages. Mempalace must be in the same Python as the one your MCP server + hook commands use. Mixing versions gives `No module named mempalace`.

3. **macOS universal binaries default to x86_64 in subprocess contexts.** `/usr/local/bin/python3` is a universal binary. When Claude Code (or the hook shell) spawns it, it can end up running x86_64 even though your terminal runs arm64. If your numpy is arm64-only (because pip chose arm64 wheels), you get the `dlopen` arch mismatch. Fix: `arch -arm64` wrapper everywhere.

4. **Use USER scope for MCP, not project scope.** Project-level `.mcp.json` is tempting because it's "close to the code". But if you ever open Claude Code in a parent directory, you lose the config. Worse, if you commit it and a colleague clones the repo, they get startup errors because they don't have mempalace. User scope (`--scope user`) avoids both problems and is still one-time setup.

5. **`mempalace init` is a trap.** It auto-generates `mempalace.yaml` with rooms mirroring your folder structure. Those rooms are meaningless for search (who wants a "src" room?), and they imply you're supposed to `mempalace mine` the project root, which is the anti-pattern from lesson 1. Skip `init`, go straight to `mine --mode convos`.

6. **Hooks delegate, they don't save.** The `Stop` hook does not persist content itself — it asks the agent to persist it via tool calls. This means per-turn saves are guaranteed only as long as the agent is obedient, at the cost of per-turn context noise. SessionStart hook is the only hook that works as "automatic" — it injects wake-up context without demanding action.

7. **Manual checkpoints beat auto-save for signal.** Auto-saving every turn produces noisy, low-value drawers. Saving explicitly at natural boundaries (end of feature, end of bug fix, end of session) produces drawers that are actually worth searching later. It requires discipline, but it scales.

8. **Test with `mempalace_search` immediately after mining.** If search returns nothing for a query you know is in your history, the mine didn't work. Don't assume success from exit code 0 — verify retrieval.

---

## 13. Quick command reference

```bash
# Install
/usr/local/bin/python3 -m pip install --user mempalace

# MCP registration (user scope)
claude mcp add --scope user mempalace -- arch -arm64 /usr/local/bin/python3 -m mempalace.mcp_server
claude mcp list
claude mcp remove mempalace -s user

# Mining (conversations only)
arch -arm64 /usr/local/bin/python3 -m mempalace mine \
  ~/.claude/projects/<hash>/ --mode convos --wing <Name> --agent <you>

# Status and search
arch -arm64 /usr/local/bin/python3 -m mempalace status
arch -arm64 /usr/local/bin/python3 -m mempalace search "query"
arch -arm64 /usr/local/bin/python3 -m mempalace wake-up

# Maintenance
arch -arm64 /usr/local/bin/python3 -m mempalace repair
du -sh ~/.mempalace/

# Backup
tar -czf mempalace-backup-$(date +%F).tar.gz ~/.mempalace/
```

---

## 14. References

- **Upstream repo:** `github.com/MemPalace/mempalace`
- **Upstream docs:** `mempalaceofficial.com`
- **PyPI package:** `pypi.org/project/mempalace`

**Scam warning (from upstream README):** the only official sources are the GitHub repo, PyPI, and `mempalaceofficial.com`. Any other domain (including `mempalace.tech`) is an impostor.

See also:
- `INDEX.md` in this folder — quick entry point
- `project-types.md` in this folder — strategy matrix for different project types (software, monorepo, research, ops, consultancy, personal KM)
