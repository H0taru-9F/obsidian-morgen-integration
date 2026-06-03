# Design Note: 01-server-check

## Goals
- Audit and refactor the server foundation.
- Align project structure with `GEMINI.md`.
- Implement core utilities (`store.js`, `helpers.js`).
- Ensure secure signature verification using `rawBody`.

## Part 1: File System Changes
- Rename `handlers/` directory to `controllers/`.
- Update all `require` statements in `index.js`.
- Create `utils/store.js` for atomic JSON operations.
- Create `utils/helpers.js` for date and timezone normalization.

## Part 2: index.js Restructuring
- **Middleware Order**:
    1. `rawBody` capture middleware (manual stream concat).
    2. `express.json()`.
    3. Global logger.
- **Signature Verification**:
    - Update `verifySignature` to use `req.rawBody`.
    - Use `crypto.timingSafeEqual` for comparison.
- **Router Mounting**:
    - Mount `tasks.js` and `time.js` from `controllers/`.
    - Remove direct business logic/switching from `index.js`.

## Part 3: Utility Implementations

### utils/store.js
- `readJsonSafe(filePath)`: Returns parsed JSON or `{}` on error.
- `writeJsonAtomic(filePath, data)`: Writes to `.tmp`, then renames.

### utils/helpers.js
- `normalizeTaskDue(scheduledStr)`: Normalizes Obsidian strings to `YYYY-MM-DDTHH:mm:ss`.
- `convertUtcToLocalMorgenFormat(utcString)`: Uses `Intl.DateTimeFormat` with `process.env.TIMEZONE`.

## Morgen API calls
- None (Verified connections in Phase 1).

## Edge cases handled
- Missing `.env` variables (early exit).
- Malformed JSON in storage (safe read).
- Atomic write failure (cleanup tmp file).
- Unhandled webhook events (log and ignore).
