# Design Note: 03-complete-integration

## Feature Summary
Handles the `task.completed` webhook from TaskNotes. It verifies the task's existence in the local mapping store and closes the corresponding task in Morgen using the `/tasks/close` endpoint.

## Affected Files
- `controllers/tasks.js`: Refine `handleTaskCompleted` logic.

## Logic Flow (`handleTaskCompleted`)
1. Extract `task.path` from `data.task`.
2. Load the mapping store using `readJsonSafe(MORGEN_IDS_FILE)`.
3. Retrieve `morgenId` for the given `task.path`.
4. If `morgenId` is missing:
   - Log warning: `[WARN] Task not found in store, skipping completion: <task.path>`.
   - Return early.
5. Send `POST` request to `https://api.morgen.so/v3/tasks/close`:
   - Headers: `Authorization: ApiKey <process.env.MORGEN_API_KEY>`.
   - Body: `{ "id": morgenId }`.
6. Log success: `[TASKS] Completed Morgen task: <morgenId>`.

## Morgen API Call
- Endpoint: `POST /tasks/close`
- Body: `{ "id": string }`

## Edge Cases
- **Task path not in idStore**: Handled by logging a warning and exiting gracefully.
- **Morgen API Error**: `morgenRequest` utility already logs errors; the handler will exit after the failed attempt.
- **State Persistence**: The mapping is NOT removed from `morgen-ids.json`.

## Verification Plan
- Send a mock `task.completed` webhook for a known task path.
- Verify `morgenRequest` is called with the correct ID.
- Verify log output for both success and "not found" scenarios.
