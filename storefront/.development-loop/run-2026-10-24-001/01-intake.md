# Intake — run-2026-10-24-001

Task: holistic cut to chips-native concierge per approved plan (~/.claude/plans/staged-finding-neumann.md).
Owner: Mobile lane (worktree-Prompter). Production untouched; battery gates promotion.

Scope classification: LIGHT PATH.
- Schema/API/external surface: changes the Agent Studio tool sheet (external config) by REMOVING a tool; no new surface, no schema change, no new dependency.
- Security-sensitive: no — net attack-surface reduction; source-grounding rules stay in the system prompt.
- Human gates preserved from the plan: prompt files reviewed by Arijit before apply (Phase 0/3), cutover coordination check, battery results before promotion.

Stages compressed (light path): Discovery/Spec/Architecture/Plan = the approved plan mode session. Risk: STRIDE-lite — removal-only + app-side checks; no new trust boundary. Build/TDD: tests-first for pure functions. Code review: internal pass + suite. Validate: local Playwright flows + battery. Staging: local 5173 IS the dev surface (dev agent wired). Finish: runbook note in CHANGELOG.

Rollback answer (required field): restore Dev agent from scripts/baseline/snapshots/dev-2026-10-24-precut.json via a dev-side patch script (pattern of promote-agent.mjs --rollback, targeting dev); app code reverts by git (incremental commits on worktree-Prompter).
