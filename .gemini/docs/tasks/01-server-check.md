# Task 01 — Server Check & Core Infrastructure

## Overview
Audit and refactor the server foundation before any feature work begins.
This task has three mandatory parts:
1. **Verify** the environment and external connections.
2. **Refactor** the existing codebase to match the canonical structure in `GEMINI.md`.
3. **Implement** the shared utility functions that all other tasks depend on.
   Do not proceed to Task 02 until all three parts are complete and verified.

---

## Part 1: Environment & Connection Checklist

The implementer MUST verify each item by running the command or reading the file — not by assuming.

### Environment
- [ ] `.env` exists with all required variables:
  - `WEBHOOK_SECRET`
  - `MORGEN_API_KEY`
  - `MORGEN_ACCOUNT_ID`
  - `MORGEN_CALENDAR_ID`
  - `TASKNOTES_API_URL=http://localhost:8080`
  - `TIMEZONE` — must be a valid IANA identifier (e.g. `Europe/Warsaw`, `Europe/Kyiv`)
### Server starts
- [ ] `node index.js` starts without syntax errors.
- [ ] Server successfully listens on port 3000.
### TaskNotes connection
- [ ] `curl http://localhost:8080/api/webhooks/deliveries` returns 200 (confirms the TaskNotes plugin API is enabled).
### Morgen connection
- [ ] `GET https://api.morgen.so/v3/integrations/accounts/list` returns the account matching `MORGEN_ACCOUNT_ID`.
- [ ] `GET https://api.morgen.so/v3/calendars/list` returns a calendar matching `MORGEN_CALENDAR_ID`.
---

## Part 2: Core Refactor (Mandatory Before Any Feature Work)

Read the existing `index.js` and any files in `handlers/` (if that directory exists). Audit them against the rules in `GEMINI.md`. The following violations are known to exist and MUST be corrected:

### 2a. Rename `/handlers` → `/controllers`
If a `/handlers` directory exists, rename it to `/controllers`. Update all `require()`/`import` paths in `index.js` accordingly.

### 2b. Fix `index.js`: add `rawBody` middleware
`index.js` MUST capture the raw request buffer before `express.json()` parses it. Without this, signature verification is impossible.

The middleware must be registered in this exact order:
```js
// 1. Raw body capture — MUST come before express.json()
app.use((req, _res, next) => {
  let chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => { req.rawBody = Buffer.concat(chunks); next(); });
});
 
// 2. JSON parser — uses the already-buffered body
app.use(express.json());
```

### 2c. Fix signature verification
Audit `index.js` and any controller/handler files for HMAC verification logic. Replace any use of `JSON.stringify(req.body)` with `req.rawBody`:

```js
// REPLACE THIS:
// const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
 
// WITH THIS:
const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(req.rawBody)
  .digest('hex');
const actual = req.headers['x-tasknotes-signature'] || '';
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

### 2d. Remove any write-back to TaskNotes
If any code in `index.js` or `controllers/` calls `TASKNOTES_API_URL` with a POST/PATCH/PUT — delete it. The server is read-only with respect to Obsidian.

### 2e. Verify `index.js` structure after refactor
After the refactor, `index.js` should contain only:
- `require` statements
- `rawBody` capture middleware
- `express.json()` middleware
- Signature verification middleware (or a shared function called by controllers)
- Router mounting (e.g. `app.use('/webhook', tasksRouter)`)
- `app.listen()`
  No business logic (no direct Morgen API calls, no `morgen-ids.json` reads/writes) should remain in `index.js`.

---

## Part 3: Core Infrastructure Implementation

### 3a. Atomic Storage (`utils/store.js`)

Create `utils/store.js` exporting exactly these two functions:

**`readJsonSafe(filePath)`**
- Reads and parses a JSON file.
- Returns `{}` if the file does not exist OR if JSON parsing fails.
- Must not throw under any condition.
  **`writeJsonAtomic(filePath, data)`**
- Serializes `data` to JSON with `JSON.stringify(data, null, 2)`.
- Writes to a temp file: `${filePath}.tmp.${Date.now()}`.
- Calls `fs.renameSync(tmpPath, filePath)` to atomically replace the target.
- On any error: attempts to delete the temp file (`fs.unlinkSync`), then re-throws.
```js
// utils/store.js — reference implementation shape
const fs = require('fs');
 
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}
 
function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}
 
module.exports = { readJsonSafe, writeJsonAtomic };
```

### 3b. Date & Timezone Utilities (`utils/helpers.js`)

Create `utils/helpers.js` exporting exactly these two functions:

**`normalizeTaskDue(scheduledStr)`**
- Input: Obsidian `scheduled` string.
- Output: exactly 19-character string in `YYYY-MM-DDTHH:mm:ss` format. No UTC conversion.
- Rules:
  - If input is null/undefined/empty → return `null`.
  - If length === 10 (`YYYY-MM-DD`) → append `T00:00:00`.
  - If length === 16 (`YYYY-MM-DDTHH:mm`) → append `:00`.
  - If length === 19 → return as-is.
  - Otherwise → log a warning and return `null`.
    **`convertUtcToLocalMorgenFormat(utcString)`**
- Input: UTC ISO 8601 string (e.g. `"2026-05-27T10:00:00.000Z"` from `time.started`).
- Output: local `YYYY-MM-DDTHH:mm:ss` string using the `TIMEZONE` env variable. No trailing `Z`.
- Uses the `Intl.DateTimeFormat` API (built-in Node.js, no extra packages needed).
```js
// utils/helpers.js — reference implementation shape
function normalizeTaskDue(scheduledStr) {
  if (!scheduledStr) return null;
  const s = String(scheduledStr).trim();
  if (s.length === 10) return `${s}T00:00:00`;
  if (s.length === 16) return `${s}:00`;
  if (s.length === 19) return s;
  console.warn(`[helpers] Unexpected scheduled format: "${s}"`);
  return null;
}
 
function convertUtcToLocalMorgenFormat(utcString) {
  const date = new Date(utcString);
  const tz = process.env.TIMEZONE || 'UTC';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}
 
module.exports = { normalizeTaskDue, convertUtcToLocalMorgenFormat };
```
 
---

## Expected Result

Before marking this task ✅, verify all of the following:

- [ ] `/handlers` renamed to `/controllers` (if it existed).
- [ ] `index.js` has `rawBody` middleware registered before `express.json()`.
- [ ] All HMAC verification uses `req.rawBody`, not `JSON.stringify(req.body)`.
- [ ] No code writes back to the TaskNotes API.
- [ ] `utils/store.js` exports `readJsonSafe` and `writeJsonAtomic`.
- [ ] `utils/helpers.js` exports `normalizeTaskDue` and `convertUtcToLocalMorgenFormat`.
- [ ] `node --check index.js` passes with no errors.
- [ ] `node index.js` starts and listens on port 3000.
- [ ] TaskNotes and Morgen connection checks pass.
  Update roadmap status to ✅ and proceed to Task 02.
 
