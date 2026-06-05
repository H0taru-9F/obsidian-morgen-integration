# Design Note - Task 07 (Stop Time Integration)

## Feature Summary
When a Pomodoro session stops, the bridge calculates the total active duration (summing active periods or falling back to total session duration), creates a calendar event in Morgen with a "🍅" prefix, and clears the local session tracking file.

## Affected Files
- `controllers/time.js`: Refactor `handleTimeStopped` to follow the exact logic specified.

## Violations to Fix
- **Incorrect Fallback**: Current code returns early if `activePeriods` is missing. It must fallback to `endTime - startTime`.
- **Overly Permissive Session Check**: Current code tries to reconstruct session from payload if `active-session.json` is missing. It must strictly return early if the file is empty/missing as per spec.
- **Start Time Reference**: Current code uses `activePeriods[0].startTime`. It should use `data.session.startTime` to represent the overall session start.

## Webhook Payload (time.stopped)
```json
{
  "event": "time.stopped",
  "data": {
    "task": { "title": "My task", "path": "path/to/task.md" },
    "session": {
      "startTime": "2026-05-27T10:00:00.000Z",
      "endTime": "2026-05-27T10:25:00.000Z",
      "activePeriods": [
        { "startTime": "2026-05-27T10:00:00.000Z", "endTime": "2026-05-27T10:25:00.000Z" }
      ]
    }
  }
}
```

## Morgen API Integration
- **Endpoint**: `POST /events/create`
- **Method**: `POST` via `morgenRequest` helper.
- **Payload**:
  - `accountId`: `process.env.MORGEN_ACCOUNT_ID`
  - `calendarId`: `process.env.MORGEN_CALENDAR_ID`
  - `title`: `🍅 <Task Title>`
  - `start`: `YYYY-MM-DDTHH:mm:ss` (Local time via `convertUtcToLocalMorgenFormat`)
  - `duration`: `PTnM` (ISO 8601 duration in minutes)
  - `showWithoutTime`: `false`
  - `timeZone`: `process.env.TIMEZONE`

## Step-by-Step Logic
1. **Load Session**: Call `readJsonSafe(ACTIVE_SESSION_FILE)`.
2. **Validate Session**:
   - If the returned object is empty (no keys), log `[TIME] Session was never started (active-session.json empty).` and return early.
   - Extract `taskTitle` from the session object (fallback to `data.task.title` or "Work session" if missing).
3. **Calculate Duration**:
   - Initialize `totalMs = 0`.
   - If `data.session.activePeriods` is an array and length > 0:
     - Sum `(new Date(p.endTime) - new Date(p.startTime))` for each period.
   - Else:
     - `totalMs = new Date(data.session.endTime) - new Date(data.session.startTime)`.
4. **Normalize Duration**:
   - `durationMins = Math.max(1, Math.round(totalMs / 60000))`.
   - `durationString = "PT" + durationMins + "M"`.
5. **Format Start Time**:
   - `startLocal = convertUtcToLocalMorgenFormat(data.session.startTime)`.
6. **Execute Morgen Call**:
   - Wrap in `try...finally`.
   - Construct payload with `🍅 ${taskTitle}`, `startLocal`, `durationString`, etc.
   - Call `morgenRequest('POST', '/events/create', payload)`.
   - Log success/failure.
7. **Cleanup**:
   - In `finally` block, call `writeJsonAtomic(ACTIVE_SESSION_FILE, {})`.

## Edge Cases & Error Handling
- **No active periods**: Handled by fallback to session start/end.
- **Duration < 1 minute**: `Math.max(1, ...)` ensures minimum `PT1M`.
- **Decimal duration**: `Math.round` ensures integer minutes.
- **Morgen API Error**: Log error but **must** still clear `active-session.json` to prevent stale state or duplicate retries.
- **Missing Task Title**: Fallback to "Work session" if not in file or payload.
