# The baseline

Established 2026-10-22. Updated 2026-10-23 (merchandising-filter tool promotion: the search tool gained the `Pricing_DiscountPercentRange` facet and a `prod_catalog_newest` index entry; instructions and system prompt unchanged). Updated 2026-10-24 (chips-native cut: `arrange_groups` removed from the tool sheet and the application; instructions and system prompt rewritten to the two-scenario funnel model; the streamed search result is the display). This is the golden set: the application on `main` and the Concierge agent definition, identical in local development and in production. Every future feature or fix starts from this point. If something here is not true, that is a bug to fix, not a variation to tolerate.

## What the baseline is

| Part | Definition |
| --- | --- |
| Application | The code on `main`. Production serves a clean Git archive of the released commit. |
| Agent | Two Agent Studio agents with **identical definitions**: development (`npm run dev` talks to it) and production (the public site talks to it). Their identifiers are configuration, not code: the settings `JTV_CONCIERGE_DEVELOPMENT_AGENT_ID` and `JTV_CONCIERGE_PRODUCTION_AGENT_ID` (in the gitignored `.env.local` locally, in Vercel's environment settings in production). The app and the baseline tools read the same settings, and both refuse to run if the two are the same. |
| Agent definition | Instructions, system prompt, tool sheet and configuration, fingerprinted in [`scripts/baseline/baseline.json`](../scripts/baseline/baseline.json). The agent's text lives in Agent Studio, not in this public repository. After the 2026-10-24 cut the prompts live as reviewable files under `docs/workspace/prompt-review-2026-10-23/cut/` alongside the live agent. |
| Tools | One native search tool, `algolia_search_index`, and one client tool this application executes: `refresh_products`. The tiles render from the streamed search output; `arrange_groups` was removed on 2026-10-24. |
| Model | `claude-sonnet-5`, same provider on both agents. |
| Guardrail | The five configured categories, identical on both agents. |
| Production URL | https://jewellerytv.vercel.app, one Vercel project (`algolia/jewellerytv`). |

## The rules (one of everything)

1. **One code base.** `main`. Work happens on short branches that merge through a pull request with CI green. Nothing else is a source of truth.
2. **One local stack.** `npm run dev` from a checkout of `main`: web `5173`, API `5174`. No second instance, no wrapper scripts, no alternate ports, no per-lane servers. If a port is busy, find out what is running; do not start another.
3. **Two agents, one definition.** Development and production differ in exactly one thing: which agent identifier the app is configured with (`JTV_CONCIERGE_DEVELOPMENT_AGENT_ID` and `JTV_CONCIERGE_PRODUCTION_AGENT_ID`). Any other difference is a defect.
4. **Production is never edited by hand.** No dashboard saves, no ad hoc patches, no scripts other than the ones below. Production changes arrive only by promotion from a tested development state.
5. **Publishing is deliberate.** A push never deploys (`git.deploymentEnabled` is false). A release is an explicit command, run on a decision, followed by verification.
6. **The product index is read-only.** No change to catalogue records or index settings, ever, from this project.

## Making a change

1. **Application code.** Branch from `main`, change, run the checks (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`), open a pull request, merge when CI is green.
2. **Agent change.** Edit the *development* agent in Agent Studio. Reload the dashboard before saving so a stale page cannot overwrite another change. Test through `npm run dev`. Do not touch production.
3. **Promote the agent** when the tested state is what you want to ship:
   `node scripts/baseline/promote-agent.mjs` (preflight, read-only, prints the exact difference), then the same command with `--execute --expect-prod=<hashes> --expect-temp=<hashes>` using the hashes the preflight printed. It refuses if either agent changed since you tested, writes a rollback snapshot under `storefront/evidence/baseline/` first, makes one change and proves the result.
4. **Release the application** when code changed or the tool sheet changed:
   `bash scripts/baseline/release-app.sh plan <sha>`, then `deploy <sha>` (builds a clean archive, deploys without switching the live site), then `promote <deployment-url>` (switches the live alias in seconds). When both change, run the agent promotion and the alias switch back to back, in that order, so the live site spends seconds, not minutes, between the two.
5. **Verify on the real surface:** `node scripts/baseline/verify-baseline.mjs` (agents equal each other and the manifest, the live site is production, the app answers every tool the agent declares), plus one real Concierge turn on the public URL.
6. **Record the new baseline** only after verification passes: `node scripts/baseline/verify-baseline.mjs --write-manifest`, commit `baseline.json` with the change, tag the commit.

## Safety nets

- **Tool-sheet guard.** The server compares the tools the agent declares with the tools this build answers. A mismatch returns a labelled `tool_sheet_mismatch` error on `/api/chat` and shows on `/api/health`, instead of an agent that appears to fail. It fails open if the agent cannot be read.
- **Promotion gates.** The promote script refuses on any hash mismatch, on a model or provider difference, and never copies the name, model or configuration it was not asked to.
- **Rollback.** `node scripts/baseline/promote-agent.mjs --rollback=<snapshot> --execute` restores the agent; `bash scripts/baseline/release-app.sh promote <previous-deployment-url>` restores the app. Keep the snapshot and the previous deployment until the next baseline is verified.
- **Verification.** `verify-baseline.mjs` exits non-zero on any difference, so it can gate a release.

## What is not part of the baseline

Shopper-journey acceptance (Plan 3.1) is not complete; the baseline records what runs, not that every journey passes. The guardrail's usefulness is under review (its output checks raised more false alarms than real catches in measured runs). The handover documentation site under `public/docs/` is maintained separately and is stamped with its own version.
