# Task 07 — Stop Time Integration

## Overview
When a Pomodoro session ends, the server calculates the actual worked duration from the `activePeriods` array, creates a calendar event in the specific Obsidian calendar on Morgen, and clears the local session tracking file.

## Trigger & Security
- **Webhook event**: `time.stopped`
- **Security**: Verify `X-TaskNotes-Signature` header against `WEBHOOK_SECRET`.

## Incoming data (from TaskNotes webhook)
```json
{
  "event": "time.stopped",
  "data": {
    "task": { "title": "My task" },
    "session": {
      "startTime": "2026-05-27T10:00:00.000Z",
      "endTime": "2026-05-27T10:25:00.000Z",
      "activePeriods": [
        { 
          "startTime": "2026-05-27T10:00:00.000Z", 
          "endTime": "2026-05-27T10:25:00.000Z" 
        }
      ]
    }
  }
}
````

## Server logic (Step-by-Step)

1. Verify the `X-TaskNotes-Signature` header. The signature is HMAC-SHA256 computed over the **raw request body buffer** (`req.rawBody`). Never use `JSON.stringify(req.body)`. and send `200 OK`.

2. Check if `active-session.json` exists. If missing, log a warning ("Session was never started") and return early.

3. **Calculate Duration**:

    - Iterate through `data.session.activePeriods`.

    - Sum `(endTime - startTime)` in milliseconds for each period.

    - If `activePeriods` is empty/missing, fallback to `data.session.endTime - data.session.startTime`.

    - Convert total ms to minutes: `Math.max(1, Math.round(totalMs / 60000))`.

4. Format the calculated duration into an ISO 8601 duration string (e.g., `PT25M`).

5. Format the start time: Strip the `.000Z` from `session.startTime` to match Morgen's `LocalDateTime` requirement (e.g., `2026-05-27T10:00:00`).

6. `POST` to `https://api.morgen.so/v3/events/create` using environment variables for the Account ID and Calendar ID.

7. Clear the `active-session.json` file (overwrite with `{}` or delete the file).


## Outgoing data (to Morgen API)

JSON

```
POST [https://api.morgen.so/v3/events/create](https://api.morgen.so/v3/events/create)
Headers:
  Accept: "application/json"
  Authorization: "ApiKey <API_KEY>"

Body:
{
  "accountId": "<MORGEN_ACCOUNT_ID>",
  "calendarId": "<MORGEN_CALENDAR_ID>",
  "title": "🍅 My task",
  "start": "2026-05-27T10:00:00",
  "duration": "PT25M",
  "showWithoutTime": false,
  "timeZone": "Europe/Warsaw"
}
```

_(Note: Prepend the tomato emoji `🍅` to the task title to visually distinguish Pomodoro blocks in the calendar)._

## Edge cases & Error Handling

- **Calculated duration is less than 1 min**: The minimum payload value must be `PT1M`.

- **Decimals in duration**: Ensure `Math.round` is used. The duration must not have decimals (e.g., `PT25M` is valid, `PT25.4M` will be rejected by Morgen).

- **Morgen API error**: If the `POST` request fails, log the error clearly. **You MUST still clear `active-session.json`** to avoid creating duplicate events if the webhook is retried or a new session starts.