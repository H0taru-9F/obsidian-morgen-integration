# Task 03 — Complete Integration

## Overview
When a task is marked as complete in Obsidian (via the TaskNotes plugin), the server must close the corresponding task in Morgen. We only close the task; we do not delete it in Morgen, nor do we remove it from our local mapping store, to preserve the visual history.

## File Location
- Code MUST be implemented inside `controllers/tasks.js`.

## Trigger & Security
- **Webhook event**: `task.completed`
- **Security**: The request must include the `X-TaskNotes-Signature` header. Verify X-TaskNotes-Signature header (HMAC-SHA256 of req.rawBody) against WEBHOOK_SECRET.

## Incoming data (from TaskNotes webhook)
```json
{
  "event": "task.completed",
  "timestamp": "2026-05-26T10:15:43.206Z",
  "data": {
    "task": {
      "path": "03-Projects/TEST TASK.md",
      "status": "done"
    }
  }
}
```
## Server logic (Step-by-Step)

1. Verify the `X-TaskNotes-Signature` header. The signature is HMAC-SHA256 computed over the **raw request body buffer** (`req.rawBody`). Never use `JSON.stringify(req.body)`.
2. Send `200 OK` immediately to the webhook before further processing.
3. Extract `data.task.path` from the webhook body.
4. Read the local `morgen-ids.json` file.
5. Look up the corresponding Morgen ID: `const morgenId = idStore[data.task.path]`.
6. If the ID is **not found**, log a warning ("Task not found in store, skipping completion") and return early.
7. `POST` to `https://api.morgen.so/v3/tasks/close` using the `ApiKey` header.

**Outgoing data (to Morgen API)**
```JSON

POST [https://api.morgen.so/v3/tasks/close](https://api.morgen.so/v3/tasks/close)
Headers:
  Accept: "application/json"
  Authorization: "ApiKey <API_KEY>"

Body:
{
  "id": "WyJBUU1rQURaa1lXWXpOel..."
}
```
**Edge cases & Error Handling**

* Task path not in idStore: The task was likely created before the integration existed or had sync disabled. Log the event and exit gracefully. Do not crash the server.
* Morgen API Error: If the /tasks/close request fails, log the error payload clearly via console.error.

**Out of scope**

* Removing from Storage: Do NOT delete the task.path mapping from morgen-ids.json.
* Calling Delete: Do NOT use the /tasks/delete endpoint.