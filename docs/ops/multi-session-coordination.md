# Multi-Session Coordination

This repo is frequently worked by more than one Claude Code / deepseek CLI session at
the same time (confirmed: up to 4 concurrent processes with the same cwd). Shared,
hand-edited scratch files (`progress.md`, `findings.md`, `task_plan.md`) have no
coordination by default — a session that reads one of these, works for a while, then
writes it back can silently discard another session's edits made in between. This
happened for real on 2026-07-18: a stale read of `progress.md` clobbered ~117 lines of
another session's history before being caught and restored (see git log around commit
`ca56319`). This document is the fix.

## Register your session

Every Claude Code session already gets a unique, memorable slug for its plan file
(e.g. `jazzy-spinning-brook.md` under `.claude/plans/`) the first time it enters plan
mode. Reuse that same slug as your session id — don't invent a new one.

At the start of substantive work, write `.claude/sessions/<slug>.json`:

```json
{
  "slug": "<slug>",
  "startedAt": "<ISO timestamp>",
  "lastHeartbeat": "<ISO timestamp>",
  "cwd": "/home/ariel/anavitrade-trading",
  "planFile": ".claude/plans/<slug>.md",
  "currentTask": "one-line description of what you're doing",
  "progressLog": "progress/<slug>.md"
}
```

Update `lastHeartbeat` and `currentTask` whenever you're about to touch a shared file.
Before editing anything shared, run `ls .claude/sessions/*.json` and skim the other
files to see who else is active and what they're doing.

## Never hand-edit progress.md directly

Append your own session's notes to `progress/<slug>.md` — a file only you write to.
This makes the read-modify-write race structurally impossible: there is nothing to
race against, because no other session ever touches your file.

`progress.md` is a **generated roll-up**, not a source of truth. Regenerate it any time
with:

```bash
bash scripts/merge-session-logs.sh
```

This concatenates every `progress/*.md`, ordered oldest-to-newest by file mtime, into
`progress.md`. It's safe to run concurrently — worst case is a slightly stale merge,
never lost data, because it only ever reads the per-session files and overwrites the
roll-up. Pre-convention history lives in `progress/_legacy-pre-2026-07-19.md`, seeded
with an old mtime so it always sorts first.

`findings.md` and `task_plan.md` can move to the same pattern if they start seeing
similar concurrent-edit traffic. Don't migrate them preemptively if they aren't — added
process has a cost too.

## Locking genuinely singular files

Some files can't be append-only — `CLAUDE.md`, schema migrations, and similar files
need one canonical version. For these, use an advisory lock (convention, not OS-level
enforcement):

```json
// .claude/locks/<safe-filename>.lock
{ "slug": "<your-slug>", "claimedAt": "<ISO timestamp>" }
```

Check for an existing lock before editing; treat a lock older than ~15 minutes with no
update as stale and ignorable. Remove the lock file after your commit lands.

## Summary

| Situation | What to do |
|---|---|
| Starting work | Write/update `.claude/sessions/<slug>.json` |
| Logging progress | Append to `progress/<slug>.md`, never edit `progress.md` directly |
| Need the merged view | `bash scripts/merge-session-logs.sh` |
| Editing a singular shared file | Check/write `.claude/locks/<file>.lock` first |
