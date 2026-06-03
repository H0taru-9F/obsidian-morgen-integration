---
playbook: testing
version: 1.1
invoked-by: /test
---

# Playbook: Testing

## Orchestration model
Same gate system: CONTINUE / FEEDBACK <text> / STOP.
Never auto-chain phases.

---

## Phase 1 — Test Generation

**Agent**: `test-engineer`

**Goal**: Write a complete executable Jest integration test suite for the implemented feature based on the design note. Do NOT run the tests.

**Inputs**:
- Implementation summary: `.gemini/docs/designs/<task-id>-summary.md`
- Design note: `.gemini/docs/designs/<task-id>-design.md`
- `GEMINI.md` (architectural rules)

**Outputs**:
- Generated Jest test suite at `tests/<task-id>.test.js`

**Gate text**:
Phase 1 (Test Generation) complete.
Agent: test-engineer
Output: tests/<task-id>.test.js generated successfully.
Awaiting confirmation.
Reply CONTINUE to go to Phase 2 (Execution & Debug).
Reply FEEDBACK <text> to rewrite the test suite, or STOP to halt.

---

## Phase 2 — Execution & Debug

**Agent**: `debug-engineer`

**Condition**: Always invoked after Phase 1.

**Goal**: Run the generated Jest test suite, capture results, and diagnose any failures. Does NOT modify code — produces test results and diagnosis only.

**Inputs**:
- Generated test suite: `tests/<task-id>.test.js`
- Current `index.js` (for context if tests fail)
- Design note

**Outputs**:
- Execution results (Passed/Failed)
- If failed: `.gemini/docs/designs/<task-id>-debug-report.md` (Diagnosis & Fix plan)

**Gate text**:
Phase 2 (Execution & Debug) complete.
Agent: debug-engineer
Results:
[If all passed] ✅ All tests passed successfully. No debug report needed.
[If failed] ❌ Tests failed. Debug report saved to: .gemini/docs/designs/<task-id>-debug-report.md

Diagnosis (if failed):
<failure>: <root cause>

Recommendation: <Proceed to Phase 3 | STOP and re-run /implement with feedback>
Awaiting confirmation. Reply CONTINUE to go to Phase 3 (Documentation) or STOP to re-open /implement.

---

## Phase 3 — Documentation

**Agent**: `documentation`

**Goal**: Update relevant docs to reflect what was tested and implemented.

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
- <case>: ❌ fail (resolved via /implement iteration)

## Issues found and resolved
<none or list>

## Docs updated
- <file>: <what changed>
````

**Gate text**: Phase 3 (Documentation) complete. 
Agent: documentation Docs updated: <list or "none"> 
Test summary: .gemini/docs/designs/-test-summary.md Task is fully complete. 
Update roadmap.md status to ✅ and reply DONE.