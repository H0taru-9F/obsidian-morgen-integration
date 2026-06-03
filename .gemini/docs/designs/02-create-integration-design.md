# Design Note: 02-create-integration

## Feature Summary
Handles the `task.created` webhook from TaskNotes. Verifies the signature, maps Obsidian task data to Morgen's API format, creates the task in Morgen, and stores the mapping of Obsidian path to Morgen ID.

## Affected Files
- `index.js`: Refactor body parsing and signature verification.
- `controllers/tasks.js`: Update `handleTaskCreated` and `mapPriority`.

## Violations to Fix
1. **Body Parsing**: Replace the manual stream-based `rawBody` capture in `index.js` with:
   ```javascript
   app.use(express.json({
     verify: (req, res, buf) => { req.rawBody = buf; }
   }));
   ```
   This ensures `req.rawBody` is available for HMAC without consuming the stream before `express.json()` can parse it.

## Data Mapping Rules (Obsidian -> Morgen)
- **title**: `data.task.title`
- **description**: `data.task.details` (omit if empty string)
- **due**: Use `normalizeTaskDue(data.task.scheduled)` from `utils/helpers.js`. Omit the `due` field if `scheduled` is null/empty.
- **priority**: Use `mapPriority(data.task.priority)`.
    - `"high"` -> `1`
    - `"medium"` -> `5`
    - `"low"` -> `9`
    - default -> `0`
- **progress**: Map `data.task.status`:
    - `"in-progress"` | `"todo"` -> `"needs-action"`
    - `"done"` | `"completed"` -> `"completed"`

## Morgen API calls
- `POST https://api.morgen.so/v3/tasks/create`
- Headers: `Authorization: ApiKey <API_KEY>`, `Content-Type: application/json`.
- Extract Morgen ID from: `response.data.id`.

## Atomic Storage Procedure
1. Receive successful response from Morgen.
2. Load current mappings using `readJsonSafe(MORGEN_IDS_FILE)`.
3. Set `idStore[task.path] = morgenId`.
4. Save mappings using `writeJsonAtomic(MORGEN_IDS_FILE, idStore)`.

## Edge cases handled
- **Missing `scheduled` date**: Omit `due` in payload.
- **Empty `details`**: Omit `description` in payload.
- **Morgen API Error**: Log `console.error` and abort storage update.
- **Signature Failure**: Return `401 Unauthorized`.
