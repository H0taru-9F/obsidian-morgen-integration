# Handler Logic Reference

## `handleTaskCreated` (`controllers/tasks.js`)
Handles `task.created`. Maps Obsidian task data (title, details, scheduled, priority, status) to Morgen API format and creates the task.
Called from: `index.js` (webhook dispatcher)

## `handleTaskCompleted` (`controllers/tasks.js`)
Handles `task.completed`. Retrieves the Morgen ID from the store and closes the task in Morgen. Logs a warning if the mapping is missing.
Called from: `index.js` (webhook dispatcher)

## `handleTaskDeleted` (`controllers/tasks.js`)
Handles `task.deleted`. Deletes the task in Morgen and removes the local mapping from the store upon success. Logs a warning if the mapping is missing.
Called from: `index.js` (webhook dispatcher)

## `handleTaskUpdated` (`controllers/tasks.js`)
Handles `task.updated`. Performs field-level diffing to prevent redundant API calls. Supports task renaming and self-healing (creating the task in Morgen if it was missing).
Called from: `index.js` (webhook dispatcher)

## `handleTimeStarted` (`controllers/time.js`)
Handles `time.started`. Persists the active session (task title, path, and start time) to `active-session.json` using atomic writes. Handles missing task data with "Unknown task" placeholders.
Called from: `index.js` (webhook dispatcher)

## `handleTimeStopped` (`controllers/time.js`)
Handles `time.stopped`. Calculates total duration, creates a "🍅" event in Morgen, and clears the active session.
Called from: `index.js` (webhook dispatcher)

## `readJsonSafe` (`utils/store.js`)
Securely reads a JSON file. Returns an empty object `{}` if the file does not exist or is malformed.
Called from: `controllers/tasks.js`, `controllers/time.js`

## `writeJsonAtomic` (`utils/store.js`)
Atomically writes data to a JSON file by writing to a temporary file first and then renaming it.
Called from: `controllers/tasks.js`, `controllers/time.js`

## `normalizeTaskDue` (`utils/helpers.js`)
Standardizes Obsidian scheduled date strings into Morgen's expected `YYYY-MM-DDTHH:mm:ss` format.
Called from: `controllers/tasks.js`

## `morgenRequest` (`utils/api.js`)
Centralized wrapper for Morgen API REST calls using `axios`. Handles authentication and logging.
Called from: `controllers/tasks.js`, `controllers/time.js`
