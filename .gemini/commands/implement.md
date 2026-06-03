---
description: Orchestrates the full implementation pipeline for one task.
  Reads the task spec from roadmap, then drives agents through phases
  with developer-confirmation gates between each phase.
argument-hint: <task-id> (e.g. create-integration, stop-time)
---

# /implement $ARGUMENTS

You are orchestrating implementation of task **$ARGUMENTS**.

## Step 0 — Locate and read the task spec

1. Read `GEMINI.md` — internalize all architectural rules
2. Read `.gemini/docs/roadmap.md` — find the entry for `$ARGUMENTS`
3. If the task is not found: STOP.
   Tell the developer: "Task $ARGUMENTS not found in roadmap.
   Add it to roadmap.md before running /implement."
4. Read `.gemini/workflows/implement-feature.md` —
   that playbook is the source of truth for the phase sequence

## Step 1 — Check prerequisites

Check if the task has a `depends_on` field in the roadmap.
If any dependency does not have status ✅: STOP.
Report: "Task <dep> is not complete. Finish it first."

## Step 2 — Execute phases from `implement-feature.md`

Follow the playbook strictly. For each phase:
1. Load the named agent
2. Collect the artifact produced
3. Present the gate text exactly as specified in the playbook
4. WAIT for developer response:
    - **CONTINUE** → proceed to next phase
    - **FEEDBACK <text>** → re-run current phase with the feedback
    - **STOP** → halt cleanly, preserve all artifacts produced so far

Never auto-chain phases. Never proceed without CONTINUE.

## Step 3 — Final output

After all phases complete and developer confirms:
- Summary saved to `.gemini/docs/designs/$ARGUMENTS-summary.md`
- List of all files created/modified
- Confirmation that `node --check index.js` is green

## Rules
- Never invent details not in the task spec — ask if ambiguous
- Never write code in Phase 2 (Design)
- Never skip a gate
- Architectural rules from `GEMINI.md` apply to every phase