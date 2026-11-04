# The live agent's prompt

`instructions.md` and `system-prompt.md` here are pulled from the dev agent by
`scripts/sync-agent-prompt.mjs`. **Do not edit them.** Edit in Agent Studio and
re-run the script; the diff then shows exactly what changed.

```
node scripts/sync-agent-prompt.mjs
```

Read-only — a GET with the search key, no writes to the agent.

## Why this exists

The prompt is edited by hand in Agent Studio, and the copy in this repository
was only updated when someone remembered. On 2026-11-04 it was nine days
behind: six paste blocks had been applied to the agent and none to the file,
so a 33,318-character copy was standing in for a 36,322-character prompt. Two
diagnoses that week were reasoned against text that was no longer live.

The old copy at `docs/workspace/on-air-2026-10-28/instructions.md` is deleted
rather than left to rot beside this one.

## Paste blocks

Drafts live in `docs/workspace/*/instructions-*.md` and
`docs/workspace/*/system-prompt-*.md`. They are proposals, not the prompt —
the prompt is here. After applying one, run the script and commit the result
with the paste block that produced it, so the history shows which change
landed when.

Applied as of 2026-11-04:

| Block | In the live prompt |
|---|---|
| On-air section, one-search rewrite | yes |
| Never narrate the work | yes |
| System prompt rewrite | yes (9,064 chars) |
| Live jtv.com schedule links | no |
| Bounded retry rule | no |
| Group sizing, four or eight | no |
| Education answers | no |
