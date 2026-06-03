# Design Note: 05-update-integration

## Feature Summary
Handles the `task.updated` webhook. Compares the new task state against the previous state to sync only changed fields to Morgen. Includes rename detection and a "Self-Healing" fallback to create the task if the Morgen ID is missing.

## Affected Files
- `controllers/tasks.js`: Refactor `handleTaskUpdated` and `getTaskDiff`.

## Logic Flow (`handleTaskUpdated`)

### 1. Verification & Timing
- Verification is handled by `index.js` middleware.
- `index.js` sends `200 OK` before calling the controller.

### 2. Diffing Logic (`getTaskDiff`)
Update the helper to strictly compare these fields and return an object with *Morgen keys*:
- `task.title` vs `previous.title` -> `title`
- `task.scheduled` vs `previous.scheduled` -> `due` (normalize using `normalizeTaskDue`)
- `task.priority` vs `previous.priority` -> `priority` (map using `mapPriority`)
- `task.status` vs `previous.status` -> `progress` (map using `mapProgress`)

**Special Case (Due Date)**: If `scheduled` changed to null/undefined, set `due: null` in diff to clear the date in Morgen.

### 3. Change Detection
If `getTaskDiff` returns `null` AND `task.path === previous.path`, return early (no sync needed).

### 4. ID Resolution & Rename Detection
1. Load `idStore` using `readJsonSafe(MORGEN_IDS_FILE)`.
2. Determine `morgenId`:
   - If `task.path !== previous.path` (Rename): Look up in `idStore[previous.path]`.
   - Else: Look up in `idStore[task.path]`.
3. If `morgenId` is still missing AND `task.morgen_id` exists in payload, use `task.morgen_id`.

### 5. Fallback Create Mode (Self-Healing)
If `morgenId` is null/undefined:
1. Build full creation payload using all mapped fields from `data.task`.
2. Call `POST /tasks/create`.
3. On success (2xx):
   - Save new ID to `idStore[task.path]`.
   - Persist using `writeJsonAtomic`.
4. Return (exit handler).

### 6. Update Mode
If `morgenId` exists:
1. Build update payload: `{ id: morgenId, ...diff }`.
2. If it was a rename but no fields changed in `diff`, `diff` will be empty. In this case, send an empty update or just handle the rename locally. *Note: Morgen doesn't store the path, only the title. If only the filename changed, the title field in the payload will trigger the update.*
3. Call `POST /tasks/update`.
4. **Order of Operations**: Only after successful response:
   - If Rename: `idStore[task.path] = morgenId`, `delete idStore[previous.path]`.
   - Else if missing from store (recovered from payload): `idStore[task.path] = morgenId`.
   - Persist using `writeJsonAtomic`.

## Morgen API Calls
- `POST /tasks/update`: Body contains `id` and changed fields.
- `POST /tasks/create`: Full payload for fallback.

## Edge Cases
- **Missing `previous`**: Treat all fields as changed.
- **API Failure**: Log error, do not update `morgen-ids.json`.
- **Rename + Field Change**: Handled naturally by Update Mode.
