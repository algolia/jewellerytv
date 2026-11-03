# Incident: every agent search fails with "Unknown response field `queryID`"

Collected 2026-10-28, JTV Concierge. Reported by others on Agent Studio as well,
so this is written as an evidence bundle for the platform team rather than a
config fix.

## Symptom

Every `algolia_search_index` tool call fails. The model retries, then tells the
shopper it is having a technical problem. Both agents are affected, development
`8129ad66` and production `0bdf59fe`, across every index in the tool sheet.

```
{"error":"bulk_search_failed",
 "indexName":"prod_catalog",
 "failures":[{"queryIndexes":[0],"name":"ApiError",
   "message":"Unknown response field `queryID`","status":400}]}
```

Correlation IDs captured: `4JD6OS-21Oxx-uLyfDXf3cT1`, `4JD6OS-21Oxy-NjFYNNeUJF1`
(on_air_shows, development), `4JD6OS-21Oy2-wC9e5v08ZNY`,
`4JD6OS-21Oy2-9oZQYMHMbOX`, `4JD6OS-21Oy2-sWuFOvCGgrV` (prod_catalog,
development), `4JD6OS-21Oy2-5MoE8SXFy…`, `4JD6OS-21Oy2-5tutXfGEt…`,
`4JD6OS-21Oy2-A4H5fOhis…` (prod_catalog, production).

## Shopper impact

The public URL serves broken turns right now. Asking
"Show me sterling silver necklaces" on https://jewellerytv.vercel.app returns
"Sterling silver necklaces have such a timeless, versatile appeal, let me pull
some lovely options for you. Let me try that search again." and then stops. Three
tool calls, three 400s, no products.

## The tool call itself is well formed

Reconstructed from the stream, development agent:

```json
{"queries":[{"query":"Jewel School","facet_seriesName":["Jewel School"]}],
 "userIntent":"Shopper wants to know what aired on Jewel School series this week",
 "originalQuery":"What aired on Jewel School this week?",
 "sessionId":"8f3b1e2a-..."}
```

The same filters succeed when issued directly against Algolia with the same
search-only key: `seriesName:"Jewel School"` returns 12 shows and 222 products.

## Minimal reproduction

Single-query and bulk endpoints behave identically. Reproduced on every index in
the application, including `prod_catalog` and `blog`.

| Request | Result |
| --- | --- |
| `clickAnalytics:true`, no `responseFields` | 200, `queryID` returned |
| `clickAnalytics:true`, `responseFields` **without** `queryID` | 200, `queryID` still returned |
| `clickAnalytics:true`, `responseFields` **with** `queryID` | **400 Unknown response field `queryID`** |
| `clickAnalytics:false`, `responseFields` without `queryID` | 200, no `queryID` |

So `queryID` is rejected as a member of `responseFields` regardless of
`clickAnalytics`, and listing it is unnecessary because the field is returned
automatically whenever click analytics is on.

## Why this is not a customer configuration change

Every index entry in the agent's search tool carries `queryID` in its
`responseFields` default, and has for as long as the repository has snapshots of
the tool declaration. Those are platform-generated defaults, not values this
project authored. The snapshots under `app/scripts/baseline/snapshots/` show the
same list on `prod_catalog`, `blog`, `help_content` and `prod_catalog_newest` back
to 2026-10-24, and searches worked throughout that period.

The platform therefore used to drop `queryID` from the `responseFields` it
forwarded to the Search API and has stopped doing so.

Both agent records show `updatedAt` within a minute of each other today,
production `2026-10-28T20:18:28Z` and development `2026-10-28T20:19:33Z`, which is
worth correlating against whatever changed platform-side.

## Workaround, if a platform fix is not imminent

Remove `queryID` from `responseFields` on every index entry. Verified to return
200 with the queryID still present when click analytics is on, so nothing is
lost. On this project that means six entries on the development agent, then
promotion to production via `scripts/baseline/promote-agent.mjs` rather than a
hand edit, per `docs/BASELINE.md` rule 4.
