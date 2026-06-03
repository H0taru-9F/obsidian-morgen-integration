
# Task 02 — Create Integration

## Overview
When a task is newly created in Obsidian (via the TaskNotes plugin), the server receives a webhook. The server must verify the request, interpret the incoming payload, map the fields to conform strictly to the Morgen REST API (`v3/tasks/create`), send the request, and save the returned Morgen ID locally.

**Important:** Obsidian remains the source of truth. The unique identifier on our end is the full note path (`data.task.path`), as `task.id` is absent during creation.

## Trigger & Security
- **Webhook event**: `task.created`
- **Security**: The request must include the `X-TaskNotes-Signature` header.

## Incoming data (from TaskNotes webhook)

```json
{
  "event": "task.created",
  "timestamp": "2026-05-26T10:14:36.022Z",
  "vault": {
    "name": "MyNotes",
    "path": "/home/hotaru/Disks/SSD/MyNotes"
  },
  "data": {
    "task": {
      "title": "TEST TASK",
      "status": "in-progress",
      "priority": "high",
      "scheduled": "2026-05-27T03:17",
      "dateCreated": "2026-05-26T12:14:35.817+02:00",
      "dateModified": "2026-05-26T12:14:35.817+02:00",
      "tags": [ "Project/Task" ],
      "path": "03-Projects/TEST TASK.md",
      "archived": false,
      "details": ""
    }
  }
}
```

## Data Mapping Rules (Obsidian → Morgen)

Morgen has strict data typing. Map the fields as follows:

- **`title`**: Use `data.task.title` as-is.

- **`description`**: Use `data.task.details`. (Omit if empty).

- **`priority`**: Map Obsidian string to Morgen number (1 is highest, 9 is lowest, 0 is undefined).

    - _Example mapping_: `"high"` → `1`, `"medium"` → `5`, `"low"` → `9`, default → `0`.

- **`due`**: Morgen requires exactly 19 characters: `YYYY-MM-DDTHH:mm:ss`.

    - Obsidian sends `YYYY-MM-DDTHH:mm` (missing seconds) or just `YYYY-MM-DD`.

    - _Rule_: Append `:00` if time is present, or `T00:00:00` if only the date is present.

- **`progress`**: Map from `data.task.status`.

    - `"in-progress"` or `"todo"` → `"needs-action"`

    - `"done"` or `"completed"` → `"completed"`

## Server logic (Step-by-Step)

1. Verify the `X-TaskNotes-Signature` header. The signature is HMAC-SHA256 computed over the **raw request body buffer** (`req.rawBody`). Never use `JSON.stringify(req.body)`.
2. Send `200 OK` immediately to the webhook before further processing.

3. Extract the `data.task` object and transform the data into the Morgen POST payload based on the mapping rules.

4. `POST` to `https://api.morgen.so/v3/tasks/create` using the `ApiKey` header.

5. Extract the Morgen ID from the response: `response.data.id`.

6. Read the local `morgen-ids.json` file.

7. Map the Obsidian path to the Morgen ID: `idStore[data.task.path] = response.data.id`.

8. Write the updated store back to `morgen-ids.json`.


## Outgoing data (to Morgen API)

JSON

```
POST [https://api.morgen.so/v3/tasks/create](https://api.morgen.so/v3/tasks/create)
Headers:
  Accept: "application/json"
  Authorization: "ApiKey <API_KEY>"

Body:
{
  "title": "TEST TASK",
  "description": "",
  "due": "2026-05-27T03:17:00",
  "priority": 1,
  "progress": "needs-action"
}
```

## Storage Update Example

JSON

```
{
  "03-Projects/TEST TASK.md": "WyJBUU1rQURaa1lXWXpOel..."
}
```

## Edge cases & Error Handling

- **Missing `scheduled` date**: If `data.task.scheduled` is null or missing, omit the `due` field entirely in the Morgen payload.

- **Empty `details`**: If `data.task.details` is an empty string, safely omit the `description` field.

- **Morgen API Error**: If the POST request fails, log the error payload clearly via `console.error` and abort the save operation. Do not crash the server.


## Out of scope

- Recurrence handling (`task.recurrence` parsing is explicitly out of scope).

- Putting the Morgen ID back into TaskNotes API.

- Tags synchronization.

- Updating an existing task (Handled in Task 05).

- Time tracking (Handled in Tasks 06-07).