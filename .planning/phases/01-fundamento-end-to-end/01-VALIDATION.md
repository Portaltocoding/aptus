---
phase: 1
slug: fundamento-end-to-end
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (Wave 0 installs) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | REQ-{XX} | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Table populated by the planner/nyquist auditor from PLAN.md tasks. Core invariants to cover — from RESEARCH.md ## Validation Architecture: scoring is a pure deterministic function tested with fixtures; `answered <= presented`; `pct` never NaN; no partial credit (binary correctness); balanced selection respects MIN_PER_DIMENSION when the pool allows; loader rejects invalid packs — missing mandatory metadata and `correct` not referencing an existing option.id.)*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest configuration
- [ ] vitest + @vitest deps installed (framework not yet present — greenfield)
- [ ] Test fixtures for scoring/session/loader under `test/` or co-located `*.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive `select` session + back-navigation + clean Ctrl+C | SESS-01 | Terminal interactivity not fully automatable | Run `npm start` (or `tsx src/index.ts start`), complete a session, navigate back to change an answer, confirm clean exit on Ctrl+C |
| Result render (per-dimension table with N + unicode bars) | RES-01 | Visual output | Inspect the rendered table after finishing a session — each dimension shows score with its N |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
