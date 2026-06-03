# Design Note: 04-delete-integration

## Feature Summary
Handles the `task.deleted` webhook from TaskNotes. It verifies the task's existence in the local mapping store, deletes the corresponding task in Morgen using the `/tasks/delete` endpoint, and removes the mapping from the local JSON store only upon success.

## Affected Files
- `controllers/tasks.js`: Refine `handleTaskDeleted` logic.

## Logic Flow (`handleTaskDeleted`)
1. Extract `task.path` from `data.task`.
2. Load the mapping store using `readJsonSafe(MORGEN_IDS_FILE)`.
3. Retrieve `morgenId` for the given `task.path`.
4. If `morgenId` is missing:
   - Log warning: `[WARN] Task not found in store, skipping deletion: <task.path>`.
   - Return early.
5. Send `POST` request to `https://api.morgen.so/v3/tasks/delete`:
   - Headers: `Authorization: ApiKey <process.env.MORGEN_API_KEY>`.
   - Body: `{ "id": morgenId }`.
6. **State Synchronization**: Only after the Morgen API returns a successful `2xx` response:
   - Remove the entry: `delete idStore[task.path]`.
   - Save the updated store using `writeJsonAtomic(MORGEN_IDS_FILE, idStore)`.
7. Log success: `[TASKS] Deleted Morgen task: <morgenId>`.

## Morgen API Call
- Endpoint: `POST /tasks/delete`
- Body: `{ "id": string }`

## Edge Cases
- **Task path not in idStore**: Handled by logging a warning and exiting gracefully.
- **Morgen API Error**: `morgenRequest` utility already logs errors. If the API call fails, the local store remains unchanged (entry is not deleted).
- **Already Deleted in Morgen**: If Morgen returns a 404 (already deleted), it's still considered a "failure" by `morgenRequest` (which returns null). However, the spec says "log the error", and rule 5 says "NEVER update the local JSON store before receiving a successful 2xx response". This means if it's already deleted in Morgen but we have an ID, we might be "stuck" with the local ID if the API returns 404. I will follow the rule strictly: only delete local entry on 2xx.

## Verification Plan
- Send a mock `task.deleted` webhook for a known task path.
- Verify `morgenRequest` is called with `/tasks/delete`.
- Verify the entry is removed from `morgen-ids.json` after successful response.
