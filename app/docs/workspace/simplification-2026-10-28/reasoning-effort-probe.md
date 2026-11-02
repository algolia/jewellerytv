# Is reasoning actually off?

Not answerable from outside the agent, and here is exactly why — plus the one
experiment that would settle it.

## What the stream does not carry

- **No reasoning events.** Every event type emitted on a shopping turn:
  `start`, `start-step`, `tool-input-start`, `tool-input-delta`,
  `tool-input-available`, `tool-output-available`, `tool-output-error`,
  `data-tool-output-metadata`, `finish-step`, `text-start`, `text-delta`,
  `text-end`, `data-suggestions`, `finish`. Nothing reasoning-shaped.
- **No token accounting at all.** `start`, `start-step`, `finish-step` and
  `finish` carry no usage object — `finish` is the bare `{"type":"finish"}`.
  Reasoning tokens are the thing that would prove this, and they are not
  exposed.

## What the timing suggests

Latency to the first byte of model output, caching off, two runs each:

| Prompt | first output | tools |
|---|---|---|
| "hi" | 1,346ms / 1,361ms | 0 |
| "Say the word blue and nothing else." | 1,311ms / 970ms | 0 |
| "What are your store hours?" | 1,953ms / 2,443ms | 1 |

**A trivial prompt reaches first output in about one second.** That is prefill
latency against a large static context, not a reasoning pass — a model
reasoning at anything above `none` would sit silent for several seconds before
the first token, even on "hi".

So the evidence points to reasoning being off, at least for prompts that do
not need it. It does not rule out effort being applied on harder turns: on a
shopping question the gap between `start` and the first `start-step` is about
2.4s against 1.0s here, which is consistent either with reasoning or with a
harder decision over five tool schemas and a large context.

## The experiment that settles it

Set the effort to `high` or `max` in the agent config and re-run this probe.
The baselines above are the control.

- **If "hi" still reaches first output in about a second**, the parameter is
  not reaching the provider — which is the finding, and one for the Agent
  Studio team.
- **If it stretches to several seconds**, the parameter works and `none` is
  genuinely being applied today.

Either way it is one setting change and two minutes of measurement, and it
turns a suspicion into an answer.

## Worth asking for

Token usage on the stream, including reasoning tokens. Without it there is no
way to verify an effort setting, attribute a latency change, or cost a turn —
three questions that have come up repeatedly in this workstream.
