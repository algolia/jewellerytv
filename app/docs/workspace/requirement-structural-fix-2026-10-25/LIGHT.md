# LIGHT — structural requirement fix, 2026-10-25

**Classification (scope gate):** LIGHT path, not silent. Touches the present_products tool
input contract (app-side TS + agent tool sheet) and the send-path wiring in
ConnectedConcierge — an external surface, but the design was Arijit-approved before this
session (SESSION.md resume action 1), acceptance is defined (probe scenarios + battery
re-run, target tile correctness ≥90% vs measured 37–57%), and production promote has its
own explicit gate (Arijit's go, hash-gated script pipeline). No new dependency, no schema
on the index, no security-sensitive data flow (the tool reads text the app already holds).

**Plan:**
1. Tool (`app/src/concierge/tools/presentProducts.ts`): remove the model-quoted
   `requirement` field from the input type. Add a `shopperMessage` supplier option;
   the tool derives the requirement from that text via the existing `matchRequirement`
   (runtime vocabulary) instead of trusting the model's quote. Model compliance was
   measured 8% — prompt-based enforcement fails on this model version.
2. Wiring: `clientTools.ts` passes the supplier; `ConnectedConcierge.tsx` holds the
   shopper's current-turn message text (ref, updated in the send path) and supplies it.
3. Tests red-first: tool derives requirement from shopper message; no model field exists;
   no material words in message → enforce nothing (current behavior preserved).
4. Agent config (separate step, hash-gated): remove `requirement` from the tool sheet
   schema + prompt instructions via `apply-curation-to-dev.mjs`; probe sterling/rubies/gold
   with `probe-scenarios.mjs`.
5. Production promote + battery re-run only after probes pass AND Arijit's go.

**Rollback answer:** app-side revert is one commit (git revert, redeploy previous bundle
via `release-app.sh deploy <prev-sha>` + promote). Agent-side: `apply-curation-to-dev.mjs`
snapshots Dev before every write; rollback snapshot path recorded at apply time. Baseline
snapshots exist at `app/scripts/baseline/snapshots/` and evidence/baseline 2026-10-25.
