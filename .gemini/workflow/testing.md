---
playbook: testing
version: 1.0
invoked-by: /test
---

# Playbook: Testing

## Orchestration model
Same gate system: CONTINUE / FEEDBACK <text> / STOP.
Never auto-chain phases.

---

## Phase 1 — Testing

**Agent**: `test-engineer`

**Goal**: Manually test the implemented feature end-to-end.
Verify webhook handling, Morgen API calls, and edge cases.

**Inputs**:
- Implementation summary: `.gemini/docs/designs/<task-id>-summary.md`
- Design note: `.gemini/docs/designs/<task-id>-design.md`
- `GEMINI.md` (architectural rules)

**Outputs**:
- Test checklist with results (pass/fail per case)
- List of failures (if any)

**Gate text**:
Phase 1 (Testing) complete.
Agent: test-engineer
Results:
✅ <test case>: pass
❌ <test case>: fail — <reason>
Failures: <count>
Awaiting confirmation.
If failures exist, reply CONTINUE to go to Phase 2 (Debug).
If all pass, reply CONTINUE to go to Phase 3 (Documentation).
Reply FEEDBACK <text> to re-run testing, or STOP to halt.

---

## Phase 2 — Debug

**Agent**: `debug-engineer`

**Condition**: Only invoked if Phase 1 has failures.

**Goal**: Diagnose failures and produce a fix plan.
Does NOT modify code — produces diagnosis only.
If a code change is needed: flag it and recommend re-running /implement.

**Inputs**:
- Phase 1 failure list
- Current `index.js`
- Design note

**Outputs**:
- Diagnosis: root cause per failure
- Fix plan: what needs to change and where
- Decision: fix here (minor) or back to /implement (logic change)

**Gate text**:
Phase 2 (Debug) complete.
Agent: debug-engineer
Diagnosis:

<failure>: <root cause>

Fix plan:

<what to change>: <where>

Recommendation: <fix here | re-run /implement with feedback>
Awaiting confirmation to proceed to Phase 3 (Documentation) or STOP to re-open /implement.

---

## Phase 3 — Documentation

**Agent**: `documentation`

**Goal**: Update relevant docs to reflect what was implemented.

**Inputs**:
- Implementation summary
- `GEMINI.md`
- `.gemini/docs/handler-logic.md` (update if handler logic changed)

**Outputs**:
- Updated `.gemini/docs/handler-logic.md` (if new handlers added)
- Test summary saved to `.gemini/docs/designs/<task-id>-test-summary.md`

**Test summary format**:
```markdown
# Test Summary: <task-id>

## Test results
- <case>: ✅ pass
- <case>: ✅ pass

## Issues found and resolved
<none or list>

## Docs updated
- <file>: <what changed>
```

**Gate text**:
Phase 3 (Documentation) complete.
Agent: documentation
Docs updated: <list or "none">
Test summary: .gemini/docs/designs/<task-id>-test-summary.md
Task <task-id> is fully complete.
Update roadmap.md status to ✅ and reply DONE.