# Task 04 — Delete Integration

## Overview
When a task is permanently deleted in Obsidian, the server must physically delete the corresponding task in Morgen to keep the calendar clean, and also remove its mapping from the local JSON store.

## File Location
- Code MUST be implemented inside `controllers/tasks.js`.

## Trigger & Security
- **Webhook event**: `task.deleted`
- **Security**: The request must include the `X-TaskNotes-Signature` header.

## Incoming data (from TaskNotes webhook)
```json
{
  "event": "task.deleted",
  "timestamp": "2026-05-26T10:20:11.102Z",
  "data": {
    "task": {
      "path": "03-Projects/TEST TASK.md"
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
6. If the ID is **not found**, log a warning ("Task not found in store, skipping deletion") and return early.
7. `POST` to `https://api.morgen.so/v3/tasks/delete` using the `ApiKey` header.
8. **CRITICAL (Order of Operations)**: Only after the Morgen API returns a successful `2xx` response, remove the entry from the local store (`delete idStore[data.task.path]`).
9. Write the updated store back to `morgen-ids.json` using `writeJsonAtomic`.

## Outgoing data (to Morgen API)

```JSON 
POST [https://api.morgen.so/v3/tasks/delete](https://api.morgen.so/v3/tasks/delete)
Headers:
Accept: "application/json"
Authorization: "ApiKey <API_KEY>"

Body:
{
"id": "WyJBUU1rQURaa1lXWXpOel..."
}
```
## Edge cases & Error Handling

- **Task path not in idStore**: Log the event and exit gracefully. Do not crash the server.

- **Morgen API Error**: If the `/tasks/delete` request fails (e.g., a 404 Not Found because it was already deleted manually in Morgen), log the error.