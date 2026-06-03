# Task 06 — Start Time Integration

## Overview
When a Pomodoro session starts in Obsidian, the server receives a webhook and saves the session context to a local JSON file. We do not call the Morgen API at this stage; we only prepare the data for when the session ends.

## Trigger & Security
- **Webhook event**: `time.started` (Note: we subscribe to `time.*`, not `pomodoro.*`, because break sessions do not emit time events).
- **Security**: Verify `X-TaskNotes-Signature` header against `WEBHOOK_SECRET`.

## Incoming data (from TaskNotes webhook)
```json
{
  "event": "time.started",
  "timestamp": "2026-05-26T10:21:05.621Z",
  "data": {
    "task": {
      "path": "03-Projects/What i get from tasknotes.md",
      "title": "What i get from tasknotes"
    },
    "session": {
      "startTime": "2026-05-26T10:21:05.600Z",
      "description": "Work session"
    }
  }
}
````

_(Note: `data.task` may be absent if time is tracked without being attached to a specific task)._

## Server logic (Step-by-Step)

1. Verify the `X-TaskNotes-Signature` header. The signature is HMAC-SHA256 computed over the **raw request body buffer** (`req.rawBody`). Never use `JSON.stringify(req.body)`.

2. Send `200 OK` immediately to the webhook before further processing.

3. Extract `data.session.startTime`.

4. Extract `data.task.title` and `data.task.path`. If `data.task` is absent or undefined, use placeholders (e.g., `title: "Unknown task"`, `path: ""`).

5. Write this context to `active-session.json`.


## Local Storage Update Example

Overwrite the file `active-session.json` with:

JSON

```
{
  "taskPath": "03-Projects/What i get from tasknotes.md",
  "taskTitle": "What i get from tasknotes",
  "startTime": "2026-05-26T10:21:05.600Z"
}
```

## Edge cases & Error Handling

- **`data.task` is missing**: Use a placeholder title and save the session anyway.

- **`active-session.json` already exists**: Overwrite it completely. This means the previous session was not stopped cleanly (e.g., Obsidian crashed), so we discard the old ghost session.


## Out of scope

- Calling the Morgen API (Creating the actual calendar event happens in Task 07).