# Task 05 — Update Integration

## Overview
When a task is updated in Obsidian, the server must diff the new state against the previous state and sync only the actual changes to Morgen.

## File Location
- Code MUST be implemented inside `controllers/tasks.js`.

**Self-Healing Feature:** If the task triggers an update but does not exist in our local `morgen-ids.json` (e.g., the server was down when the task was initially created), the server must seamlessly fall back to creating the task in Morgen and saving the new ID.

## Trigger & Security
- **Webhook event**: `task.updated`
- **Security**: Verify `X-TaskNotes-Signature` header against `WEBHOOK_SECRET`.

## Incoming data (from TaskNotes webhook)
```json
{
  "event": "task.updated",
  "data": {
    "task": {
      "path": "03-Projects/NEW TASK NAME.md",
      "title": "NEW TASK NAME",
      "status": "in-progress",
      "scheduled": "2026-05-28",
      "priority": "high"
    },
    "previous": {
      "path": "03-Projects/OLD TASK NAME.md",
      "title": "OLD TASK NAME",
      "status": "todo",
      "scheduled": "2026-05-27",
      "priority": "medium"
    }
  }
}
```

## Server logic (Step-by-Step)

1. Verify the `X-TaskNotes-Signature` header. The signature is HMAC-SHA256 computed over the **raw request body buffer** (`req.rawBody`). Never use `JSON.stringify(req.body)`, send `200 OK` to webhook.

2. **Diffing**: Compare `data.task` vs `data.previous` strictly on these mapped fields:

   - `title`

   - `scheduled` (needs mapping to `due`)

   - `priority` (needs mapping to numeric)

   - `status` (needs mapping to `progress`)

3. If there are **no changes** in the fields above, return early. (Prevents API spam from keystrokes in descriptions/details).

4. **Rename Detection**: If `data.task.path !== data.previous.path`:
   - Look up the old ID using `data.previous.path`.
   - If the old ID is missing, transparently switch to **Fallback Create Mode** (Step 6).
   - (Do NOT write to `morgen-ids.json` yet).

5. Look up Morgen ID: `const morgenId = idStore[data.task.path]`.

6. **Fallback (Create Mode)**: If `morgenId` is undefined/null:

   - Map all required fields from `data.task`.

   - `POST` to `https://api.morgen.so/v3/tasks/create`.

   - Extract `response.data.id`, save to `idStore[data.task.path]`, and update `morgen-ids.json`.

   - Return (do not proceed to update).

7. **Update Mode**: If `morgenId` exists:
   - Build a payload containing _only_ the mapped fields that actually changed, plus the `id`.
   - `POST` to `https://api.morgen.so/v3/tasks/update`.
   - **CRITICAL (Order of Operations)**: Only after a successful `2xx` API response, update the local store:
      - If it was a rename: `idStore[data.task.path] = idStore[data.previous.path]` and `delete idStore[data.previous.path]`.
      - Save the database using `writeJsonAtomic`.

## Data Mapping Rules

- `priority`: "high"→1, "medium"→5, "low"→9, default→0.

- `due`: Append `T00:00:00` if time is missing. If `scheduled` changed to null, send `due: null` (to clear date).

- `progress`: "todo"/"in-progress" → "needs-action", "done" → "completed".


## Outgoing data (to Morgen API)

### Example 1: Update (Only Changed Fields)

```JSON
POST [https://api.morgen.so/v3/tasks/update](https://api.morgen.so/v3/tasks/update)
Headers: Accept, Authorization: ApiKey <API_KEY>
Body:
{
  "id": "WyJBUU1rQURaa1lXWXpOel...",
  "title": "NEW TASK NAME",
  "due": "2026-05-28T00:00:00"
}
```

### Example 2: Fallback Create (If ID was missing)

```JSON
POST [https://api.morgen.so/v3/tasks/create](https://api.morgen.so/v3/tasks/create)
Headers: Accept, Authorization: ApiKey <API_KEY>
Body:
{
  "title": "NEW TASK NAME",
  "due": "2026-05-28T00:00:00",
  "priority": 1,
  "progress": "needs-action"
}
```

## Edge cases & Error Handling

- **Missing `previous` data**: If `data.previous` is somehow undefined, treat all fields as "changed" and proceed to update/create.

- **Morgen API Error**: Log clearly. Do not corrupt local `morgen-ids.json`.


## Out of scope

- Time tracking.