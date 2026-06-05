# TaskNotes → Morgen Bridge

Local, one-way synchronization bridge between Obsidian (TaskNotes plugin) and the Morgen calendar.

## Implemented Features

### 01-server-check — Server Core Foundation

**Webhook event**: N/A (Core infrastructure)
**Controller**: `index.js`, `utils/*.js`

#### What it does
Sets up the Express server with secure signature verification and modular routing. It establishes the core utilities for atomic file storage, date normalization, and centralized Morgen API communication.

#### Storage
- **Reads**: `morgen-ids.json` — Reads task mappings using `readJsonSafe`.
- **Writes**: `morgen-ids.json` — Atomically writes updates using `writeJsonAtomic` to prevent file corruption.

#### Edge cases handled
- **Invalid Signatures**: Returns `401 Unauthorized` for payloads that don't match the HMAC-SHA256 hash.
- **Malformed JSON**: Gracefully handles bad payloads during parsing.
- **Missing Env Vars**: Server fails fast with a descriptive error message if required keys are missing.

### 02-create-integration — Task Creation

**Webhook event**: `task.created`
**Controller**: `controllers/tasks.js`

#### What it does
Triggers when a new task is created in Obsidian. It maps Obsidian's task fields to Morgen's API format, creates the task in Morgen, and stores the mapping between the Obsidian file path and the Morgen task ID.

#### Data flow
| Obsidian field | Morgen field | Notes |
|----------------|--------------|-------|
| `task.title` | `title` | — |
| `task.details` | `description` | Omitted if empty |
| `task.scheduled` | `due` | Normalized to 19-char format via `normalizeTaskDue()` |
| `task.priority` | `priority` | `"high"`→1, `"medium"`→5, `"low"`→9, default→0 |
| `task.status` | `progress` | `"todo"`/`"in-progress"`→`"needs-action"`, `"done"`/`"completed"`→`"completed"` |

#### Storage
- **Reads**: `morgen-ids.json` — Loads existing mappings.
- **Writes**: `morgen-ids.json` — Stores the new `task.path` -> `morgenId` mapping after successful API call.

#### Edge cases handled
- **Missing dates**: If `scheduled` is absent, the `due` field is omitted from the Morgen payload.
- **API Failures**: If Morgen returns an error, the local mapping is NOT updated, ensuring consistency.

#### Out of scope
- Task updates, deletions, or completion (handled in subsequent tasks).

### 03-complete-integration — Task Completion

**Webhook event**: `task.completed`
**Controller**: `controllers/tasks.js`

#### What it does
Triggers when a task is marked as completed in Obsidian. It retrieves the corresponding Morgen task ID from the local mapping store and closes the task in Morgen via the `/tasks/close` endpoint.

#### Storage
- **Reads**: `morgen-ids.json` — Looks up the `morgenId` using `task.path`.
- **Writes**: None (mappings are preserved).

#### Edge cases handled
- **Task path not in store**: Logs a warning and returns early without calling Morgen.
- **Immediate Response**: Sends a `200 OK` to TaskNotes before executing the API call to Morgen.

#### Out of scope
- Removing the mapping from `morgen-ids.json` (mappings are retained to support potential un-completion or reference).

### 04-delete-integration — Task Deletion

**Webhook event**: `task.deleted`
**Controller**: `controllers/tasks.js`

#### What it does
Handles task deletion in Obsidian. It identifies the corresponding Morgen task via the local mapping store, deletes it in Morgen, and removes the local mapping only after a successful API confirmation.

#### Storage
- **Reads**: `morgen-ids.json` — Retrieves the `morgenId` associated with `task.path`.
- **Writes**: `morgen-ids.json` — Removes the mapping entry after successful deletion in Morgen.

#### Edge cases handled
- **Task path not in store**: Logs a warning and returns early without making an API call.
- **Morgen API failure**: If the deletion request fails, the local mapping is retained to prevent desynchronization (Rule 5).
- **Immediate Response**: Sends a `200 OK` to TaskNotes before executing the deletion logic (Rule 1).

### 05-update-integration — Task Update

**Webhook event**: `task.updated`
**Controller**: `controllers/tasks.js`

#### What it does
Syncs changes made to tasks in Obsidian to Morgen. It uses field-level diffing to avoid unnecessary API calls and supports "self-healing" by creating the task in Morgen if the local mapping is missing but the task exists in Obsidian.

#### Data flow
| Obsidian field | Morgen field | Notes |
|----------------|--------------|-------|
| `task.title` | `title` | — |
| `task.details` | `description` | — |
| `task.scheduled` | `due` | Normalized |
| `task.priority` | `priority` | Mapped to Morgen integers |
| `task.status` | `progress` | Mapped to `needs-action` or `completed` |

#### Storage
- **Reads**: `morgen-ids.json` — Looks up Morgen ID.
- **Writes**: `morgen-ids.json` — Updates path mapping if the task is renamed or newly created.

#### Edge cases handled
- **Rename detection**: Updates the key in `morgen-ids.json` when a task's path changes.
- **No changes**: Returns early if none of the tracked fields have changed.
- **Missing Task**: Automatically creates the task in Morgen if it can't find a mapping (self-healing).

### 06-start-time-integration — Start Pomodoro Session

**Webhook event**: `time.started`
**Controller**: `controllers/time.js`

#### What it does
Triggers when a Pomodoro session starts in Obsidian. It records the session context (task title, path, and start time) in a local `active-session.json` file. This data is used later by the `time.stopped` handler to create a calendar event.

#### Data flow
| Obsidian field | Session field | Notes |
|----------------|---------------|-------|
| `data.task.path` | `taskPath` | Default `""` |
| `data.task.title` | `taskTitle` | Default `"Unknown task"` |
| `data.session.startTime` | `startTime` | Required |

#### Storage
- **Writes**: `active-session.json` — Stores the current session metadata atomically.

#### Edge cases handled
- **Missing task data**: Uses "Unknown task" as title if the task object is missing from the payload.
- **Missing startTime**: Logs a warning and aborts processing if no start time is provided.
- **Signature verification**: Uses the robust `express.json({ verify })` pattern to capture the raw request body for HMAC verification.

#### Out of scope
- Calling the Morgen API (this handler only records local state).

### 07-stop-time-integration — Stop Pomodoro Session

**Webhook event**: `time.stopped`
**Controller**: `controllers/time.js`

#### What it does
Triggers when a Pomodoro session ends. It calculates the total active duration, creates a calendar event in Morgen prefixed with "🍅", and clears the local session tracking file.

#### Data flow
| Obsidian field | Morgen field | Notes |
|----------------|--------------|-------|
| `data.task.title` | `title` | Prefixed with "🍅 " |
| `data.session.startTime` | `start` | Normalized to Morgen local format |
| calculated duration | `duration` | ISO 8601 format (`PTnM`), minimum 1 minute |

#### Storage
- **Reads**: `active-session.json` — Retrieves the active session context.
- **Writes**: `active-session.json` — Clears the session file (sets to `{}`) after completion.

#### Edge cases handled
- **Missing Session File**: Returns early if no active session is found.
- **No Active Periods**: Falls back to total session duration (endTime - startTime).
- **Short Sessions**: Minimum 1-minute duration enforced.
- **API Failure**: Session file is cleared even if the Morgen API call fails.
