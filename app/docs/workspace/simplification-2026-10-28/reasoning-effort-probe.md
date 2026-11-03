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

## Result: effort `high` changes nothing measurable

### Trivial prompts, unchanged

| Prompt | effort `none` | effort `high` |
|---|---|---|
| "hi" | 1,346 / 1,361ms | 1,739 / 1,234ms |
| "Say the word blue and nothing else." | 1,311 / 970ms | 1,085 / 894ms |
| "What are your store hours?" | 1,953 / 2,443ms | 1,941 / 2,148ms |

### A reasoning-heavy prompt, at `high`

A three-variable word problem, tools explicitly forbidden, three runs: first
token at 2,067–2,464ms, total 2,590–3,374ms. And the answer **shows its
working in the visible text** — "Let the second gift cost x. First gift: 2x…"
— rather than arriving after a silent pause. That is a model thinking out
loud in its response, which is what happens when reasoning is not running.

### The eight-question eval

| | effort `none` | effort `high` |
|---|---|---|
| median turn | 9,013ms | **6,740ms** |
| median to first hits | 3,926ms | 3,346ms |
| steps | 2 on 8 of 8 | 2 on 7 of 8 |

**High is faster than none**, which is the opposite of what reasoning would
produce. Taken together the three probes say the setting is not reaching the
model, or the model is ignoring it.

## A correction this forces on the earlier numbers

Three runs of the same eight questions have now produced medians of 5,751ms,
9,013ms and 6,740ms. An earlier note called the gap between the first two
"outside run-to-run noise" on the strength of their ranges barely
overlapping. With a third sample that claim does not hold: this agent's
median moves by two to three seconds between identical runs.

So the "unexplained 3.3s" attributed to the system prompt rewrite is most
likely variance, and single-run comparisons in this workstream should be read
as indicative rather than conclusive. Differences worth acting on need several
runs per configuration — the step count, the failure count and the tool-call
shape have been far more stable than the timings and are the better signals.

## Recommendation

Set effort back to `none`. There is no measured benefit to `high`, and if the
parameter ever starts being honoured, `none` is the cheaper default for an
agent whose work is retrieval rather than reasoning.

For the platform team, this is the second half of the same ask: expose token
usage on the stream. Without reasoning-token counts there is no way to
confirm whether an effort setting is applied, and a latency probe cannot
distinguish "not forwarded" from "forwarded and ignored".
