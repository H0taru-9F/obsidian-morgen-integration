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
