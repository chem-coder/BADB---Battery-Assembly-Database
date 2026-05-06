# Git Workflow

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Source paths: `docs/archive/superseded/2026-05-06-inbox-cleanup/merging_branches_workflow.md`, `docs/archive/superseded/2026-05-06-inbox-cleanup/GitHub steps.md`

This is a small Git collaboration runbook for BADB.

## Start From Current Main

Before starting a new branch:

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-name>
```

Work, test, commit, and push from the feature branch.

## Bring A Remote Branch Into Main

Only merge a remote branch into `main` when local work is committed or safely stashed.

```bash
git checkout main
git pull origin main
git fetch origin
git merge origin/<branch-name>
```

If the branch name is unclear:

```bash
git branch
git branch -r
git branch -a
```

After a successful merge and checks:

```bash
git push origin main
```

## Message To A Collaborator

After merging, the collaborator can update local `main`:

```bash
git checkout main
git pull origin main
git checkout -b feature/<next-work>
```

Old branches can remain as history unless the team explicitly decides to prune them.

## Caution

Do not merge someone else's old branch into uncommitted local work.

Commit or stash first, or wait until the active work is finished.
