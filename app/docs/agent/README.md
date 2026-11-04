# The agent's prompt

Two files are the source of truth for what the agent should say:

| File | What it is |
|---|---|
| `instructions.md` | The intended instructions. **Edit this**, then paste it whole into Agent Studio. |
| `system-prompt.md` | The intended system prompt. Same. |
| `*.live.md` | What the agent actually has. Written by the sync script; never edit. |

```
node scripts/sync-agent-prompt.mjs
```

Read-only — a GET with the search key. It writes the `.live.md` copies and
prints one line per prompt:

```
instructions: DIFFERS  intended 39,078 chars, live 36,301 chars
system prompt: MATCHES  (9,063 chars)
```

Exits non-zero while anything differs, so it can gate a check later.

## The workflow

1. Edit `instructions.md` here.
2. Select all, paste it into the agent's instructions in Agent Studio, save.
3. Run the script. `MATCHES` means it landed.
4. Commit the change with whatever measurement prompted it.

Paste the **whole file**, not a section. Sections were how this went wrong:
a block would be drafted, believed applied, and the agent would never have
seen it.

## Why it is built this way

The prompt is edited by hand in a web form, so the repository can only ever
*claim* to know what the agent says. On 2026-11-04 the tracked copy was nine
days and six paste blocks behind the live agent; later the same day, two
edits believed to be applied turned out never to have reached it, and an hour
went into diagnosing behaviour from text that was not running. The script
replaces that guess with a one-line verdict.

## Paste blocks

`docs/workspace/*/instructions-*.md` hold the drafts and, more usefully, the
measurement and reasoning behind each change — why a rule exists, what it
replaced, what it cost. They are history, not the prompt. The prompt is
`instructions.md`; every block that has survived review is already folded
into it.
