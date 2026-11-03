# Swapping the dev agent to OpenAI: two separate problems

Measured 2026-10-30 against the dev agent after the model was changed.

## 1. GPT-5.4 fails outright, before the agent runs

```
type:    UpstreamProviderError
status:  424
message: Attempted to access resource with incorrect regional hostname.
         Please make your request to us.api.openai.com
```

Deterministic: three runs, 1.9 to 2.1s each, erroring immediately after `start`
with zero steps — before a tool call, a search, an index or a line of the
prompt is reached. The same agent answered eight of eight questions on
`claude-sonnet-5` the same evening, so nothing in its configuration is
implicated.

OpenAI's regional data residency appears to apply per model: 4.1-mini is served
on the global `api.openai.com` that Agent Studio calls, 5.4 requires
`us.api.openai.com`. The fix is either an OpenAI project without residency
pinning, or a regional base URL configurable on the provider key in Agent
Studio — which is the third thing worth asking the platform team.

## 2. GPT-4.1-mini runs, and does not call the display tool

Three questions, three times only one tool call — the search:

| Question | tools called | tool-input chars | total | reply |
|---|---|---|---|---|
| Show me opal jewelry | search only | 6,062 | 14,693ms | prose, ends "Would you li…" |
| What did Misty feature this week? | search only | 487 | 5,472ms | prose, names pieces |
| I need a gift for my mom under $200 | search only | 6,089 | 12,015ms | a clarifying question, no pieces |

**No shelf ever renders.** `algolia_grouped_results` is never invoked, so the
panel shows text and nothing else. That is the whole product.

Two further regressions, both behaviours the instructions explicitly ban:

- The opal reply ends by offering — "Would you like…" — which the Voice section
  forbids ("Don't: offer, announce or narrate. They asked; the pieces appear").
- The budget question is answered with a clarifying question and an empty
  shelf, which has its own bullet ("Don't: answer 'show me what you have' with
  a question and an empty shelf").

### The null-filling

The model writes every optional parameter of the search tool explicitly as
`null` — about 120 facet parameters on `prod_catalog`:

```
{"query":"opal","facet_Catalog_AnkletType":null,"facet_Catalog_BackingType":null,
 … ~120 more …,"facet_Catalog_GemstoneAndPearlNavigationName":["Opal"], … }
```

6,062 characters of tool input for one search, against roughly 300 for the same
search on Claude — a twentyfold difference, generated token by token on every
turn. It scales with the index's facet count, which is why the on-air question
cost 487 characters and the catalogue questions cost six thousand: Claude omits
parameters it is not using, this model fills the schema.

## Verdict

Not a usable development model as configured. 5.4 cannot be reached at all,
and 4.1-mini produces a text-only assistant that offers instead of showing. If
the point of the swap was cost or speed, neither materialised: 12 to 15 seconds
on catalogue questions, with twenty times the tool-input tokens.
