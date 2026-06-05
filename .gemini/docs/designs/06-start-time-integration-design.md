# Design — Task 06: Start Time Integration (Refactored)

## Feature Summary
This design addresses the integration of the `time.started` webhook and refactors the `rawBody` capture mechanism in `index.js` to ensure reliable payload parsing. When a session starts, the server captures the task context and start time, saving it to `active-session.json`.

## Affected Files
- `index.js`: Refactor `express.json` to capture `rawBody` using the `verify` option. Remove the legacy stream-consuming middleware.
- `GEMINI.md`: Update Rule 2 (Signature Verification) to recommend the `express.json({ verify })` pattern.
- `controllers/time.js`: Ensure `handleTimeStarted` uses correct placeholders and atomic storage (already implemented, but verified).

## Violations to Fix
### 1. Problematic `rawBody` Capture
- **Before**: A manual middleware `app.use((req, res, next) => { ... req.on('data', ...) })` is placed before `express.json()`. This consumes the request stream, which can cause `express.json()` to fail or hang.
- **After**: Use `express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })`. This leverages the built-in parser to capture the raw buffer without double-consuming the stream.

## Webhook Payload (`time.started`)
```json
{
  "event": "time.started",
  "data": {
    "task": {
      "path": "03-Projects/My Task.md",
      "title": "My Task"
    },
    "session": {
      "startTime": "2026-05-26T10:21:05.600Z"
    }
  }
}
```

## Morgen API Integration
- **None for this task.** Data is saved locally for use during the `time.stopped` event.

## Step-by-Step Logic

### 1. Refactor `index.js` (Infrastructure)
1.  Remove the manual stream capture middleware (lines 37-45).
2.  Replace `app.use(express.json());` with:
    ```js
    app.use(express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    ```
3.  Ensure `verifySignature` continues to use `req.rawBody`.

### 2. Update `GEMINI.md` (Documentation)
1.  Locate Rule 2 "Signature Verification (CRITICAL)".
2.  Update the "CORRECT" example to show the `express.json({ verify })` pattern instead of the separate middleware.

### 3. Verify `controllers/time.js` (Logic)
1.  The `handleTimeStarted(data)` function must:
    -   Extract `startTime` from `data.session.startTime`.
    -   Extract `taskPath` and `taskTitle` from `data.task`, defaulting to `""` and `"Unknown task"` respectively.
    -   Write the object `{ taskPath, taskTitle, startTime }` to `active-session.json` using `writeJsonAtomic`.

## Edge Cases & Error Handling
- **Missing `startTime`**: Log a warning and abort processing (session cannot be tracked without a start time).
- **Missing `task` data**: Use placeholders as defined. This allows tracking time for tasks not yet saved or general work sessions.
- **Invalid JSON in `active-session.json`**: `writeJsonAtomic` will overwrite the file, so corruption in the old file won't prevent a new session from starting.
- **Signature mismatch**: Handled by `verifySignature` middleware in `index.js` (returns 401).
