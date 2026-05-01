# Automatic backup (macOS launchd)

This folder provides a **local-only** macOS launchd agent that runs
`scripts/backup.js` daily at 23:00 with 30-day retention.

Not relevant on Linux (use cron) or Windows (use Task Scheduler).

## Install

```bash
bash scripts/launchd/install.sh
```

What it does:

1. Renders `com.badb.backup.plist.template` with the absolute path to this repo.
2. Writes it to `~/Library/LaunchAgents/com.badb.backup.plist`.
3. Validates the plist (`plutil -lint`).
4. Loads the agent into launchd (`launchctl bootstrap`).
5. Triggers an immediate smoke-test run so you can see it working.

The plist itself is NOT committed — only the template is. This keeps the
setup reproducible without leaking per-user paths into git.

## Status

```bash
bash scripts/launchd/install.sh --status
```

Shows whether the agent is loaded, whether the plist file exists, and
the last few lines of `sql_backups/auto/backup.log`.

## Uninstall

```bash
bash scripts/launchd/install.sh --uninstall
```

Unloads the agent from launchd and removes the plist.

## Schedule

Fixed at 23:00 every day. If the Mac is asleep at 23:00, the job is
skipped (RunAtLoad=false) — it will run at the next 23:00. If you need
a different cadence, edit the template's `StartCalendarInterval` block.

## Logs

- `sql_backups/auto/backup.log` — append-only audit log written by `backup.js`
- `sql_backups/auto/launchd.out.log` — stdout of launchd invocations
- `sql_backups/auto/launchd.err.log` — stderr of launchd invocations

All three are gitignored via the existing `sql_backups/auto/` rule.

## Retention

The installed command is `node scripts/backup.js --keep-days=30`. That
means: after each daily backup, dumps older than 30 days are rotated
out. Change this in the template if you want a different window.

## Offsite copy (recommended)

Edit the ProgramArguments in `com.badb.backup.plist.template` to chain
`--copy-to=/Volumes/NAS/backups/badb`:

```xml
<string>cd __REPO_ABS_PATH__ && /usr/local/bin/node scripts/backup.js --keep-days=30 --copy-to=/Volumes/NAS/backups/badb</string>
```

Then re-run `bash scripts/launchd/install.sh` to apply.

## Troubleshooting

**Job loaded but never runs:** macOS may block background LaunchAgents
if battery is discharging. Check System Settings → General → Login Items
& Extensions. The backup agent should be "Allow in Background".

**pg_dump not found:** adjust the `PATH` EnvironmentVariable in the
template to include your PostgreSQL bin directory (e.g.
`/Applications/Postgres.app/Contents/Versions/latest/bin`).

**Backup fails silently:** check `sql_backups/auto/launchd.err.log` for
stderr output.
