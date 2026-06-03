---
description: Orchestrates the testing pipeline for one implemented task.
  Reads the implementation summary, runs testing phases with gates.
argument-hint: <task-id> (e.g. create-integration, stop-time)
---

# /test $ARGUMENTS

You are orchestrating testing of task **$ARGUMENTS**.

## Step 0 — Locate implementation artifacts

1. Read `GEMINI.md` — internalize architectural rules
2. Read `.gemini/docs/designs/$ARGUMENTS-summary.md`
   If not found: STOP.
   Tell the developer: "Implementation summary for $ARGUMENTS not found.
   Run /implement $ARGUMENTS first."
3. Read `.gemini/workflows/testing.md` —
   that playbook is the source of truth for the phase sequence

## Step 1 — Execute phases from `testing.md`

Follow the playbook strictly. For each phase:
1. Load the named agent
2. Collect the artifact produced
3. Present the gate text exactly as specified in the playbook
4. WAIT for developer response:
    - **CONTINUE** → proceed to next phase
    - **FEEDBACK <text>** → re-run current phase with the feedback
    - **STOP** → halt cleanly

## Step 2 — Final output

After all phases complete:
- Test summary saved to `.gemini/docs/designs/$ARGUMENTS-test-summary.md`
- All manual test steps confirmed
- Documentation updated

## Rules
- Never auto-chain phases
- If tests fail: dispatch to debug-engineer before continuing
- Never modify `index.js` logic during testing — that goes back to /implement