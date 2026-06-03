# Handler Logic Reference

## `handleTaskCreated` (`controllers/tasks.js`)
Handles `task.created`. Maps Obsidian task data (title, details, scheduled, priority, status) to Morgen API format and creates the task.
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
