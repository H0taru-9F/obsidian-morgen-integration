---
playbook: implement-feature
version: 1.0
invoked-by: /implement
---

# Playbook: Implement Feature

## Orchestration model
- Each phase is dispatched to a single agent
- Each phase produces named artifacts
- Each phase ends with a developer-confirmation gate — Claude MUST STOP
- Gates accept: CONTINUE / FEEDBACK <text> / STOP

---

## Phase 1 — Discovery

**Agent**: `architect` (read-only mode)

**Goal**: Understand full context. Read task spec; identify which webhook events
and Morgen API calls are involved; flag any ambiguities before design.

**Inputs**:
- Task spec from `.gemini/docs/roadmap.md`
- `GEMINI.md` (architectural rules)
- Current `index.js` (scan for existing handlers)

**Outputs** — Discovery Note (inline in gate):
- Webhook event(s) involved
- Morgen API calls required
- Files to be modified
- Open questions (if any)

**Gate text**:
Phase 1 (Discovery) complete.
Agent: architect
Discovery Note:

Webhook events: <list>
Morgen API calls: <list>
Files to modify: <list>
Open questions: <list or "none">

Awaiting confirmation to proceed to Phase 2 (Design).
Reply CONTINUE, FEEDBACK <text>, or STOP.
---

## Phase 2 — Design

**Agent**: `architect` (full design mode)

**Goal**: Produce a concrete, step-by-step design note that the implementer
can follow without making any decisions.

**Inputs**:
- Phase 1 Discovery Note
- Task spec from roadmap
- Current `index.js`

**Outputs**:
- Design note saved to `.gemini/docs/designs/<task-id>-design.md`

**Gate text**:
Phase 2 (Design) complete.
Agent: architect
Artifact: .gemini/docs/designs/<task-id>-design.md
Design summary: <2-3 sentences>
Morgen API calls: <list>
Edge cases handled: <list>
Awaiting confirmation to proceed to Phase 3 (Implementation).
Reply CONTINUE, FEEDBACK <text>, or STOP.

---

## Phase 3 — Implementation

**Agent**: `implementer`

**Goal**: Write production Node.js code per the approved design note.

**Inputs**:
- Approved design note from `.gemini/docs/designs/<task-id>-design.md`
- Current `index.js`
- `GEMINI.md` (architectural rules)

**Outputs**:
- Modified `controllers/*.js` for feature logic (as applicable)
- Modified `utils/*.js` for shared logic (as applicable)
- Modified `index.js` only for server wiring/middleware/router mounting (if needed)
- Updated `morgen-ids.json` schema (if applicable)
- `node --check` passes for all changed `.js` files
- Implementation summary saved to `.gemini/docs/designs/<task-id>-summary.md`

**Summary format**:
```markdown
# Implementation Summary: <task-id>

## What was implemented
<2-3 sentences>

## Files modified
- <file>: <reason>

## New handler functions
- <function name>: <what it does>

## New environment variables
- <none or list>

## New npm packages
- <none or list>

## Syntax check
node --check index.js: ✅
```

**Gate text**:
Phase 3 (Implementation) complete.
Agent: implementer
Files modified: <list>
New handlers: <list>
node --check: ✅
Summary saved to: .gemini/docs/designs/<task-id>-summary.md
Implementation complete. Run /test <task-id> when ready to test.
Reply CONTINUE to confirm, FEEDBACK <text> to iterate, or STOP to halt.

---

## Failure handling
- FEEDBACK at any gate re-runs that phase with the feedback incorporated
- STOP halts cleanly — all artifacts produced so far are preserved
- Re-running /implement <task-id> picks up by re-reading current state
- If node --check fails: implementer fixes and re-runs before presenting gate