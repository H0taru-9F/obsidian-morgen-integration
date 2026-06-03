# TaskNotes → Morgen Bridge

## WHY: Project Purpose
This is a local, one-way synchronization bridge between Obsidian (TaskNotes plugin) and the Morgen calendar. Obsidian remains the absolute source of truth for tasks. Morgen is strictly a visual presentation layer (task views, Pomodoro history).

> **One-way rule**: The server ONLY reads from Obsidian (via webhooks) and writes to Morgen (via REST API). It never writes data back to the TaskNotes plugin or to any Obsidian file.

## WHAT: Architecture & Stack
This is a Node.js Express server running locally alongside an Obsidian vault.
- **Server**: Node.js + Express (Port 3000)
- **Inputs (Webhooks)**: Receives webhooks from TaskNotes HTTP API (Port 8080).
- **Outputs (Morgen API)**: Calls Morgen REST API v3 (`https://api.morgen.so/v3`) authenticated via `ApiKey`.
- **Persistence**: Local JSON files (`morgen-ids.json` for mappings, `active-session.json` for time tracking).
## HOW: Execution & Verification
Start the server:
`npm start`

Required `.env` variables: `WEBHOOK_SECRET`, `MORGEN_API_KEY`, `MORGEN_ACCOUNT_ID`, `MORGEN_CALENDAR_ID`, `TASKNOTES_API_URL`, `TIMEZONE`.

Valid `TIMEZONE` values are IANA timezone identifiers (e.g. `Europe/Warsaw`, `Europe/Kyiv`, `America/New_York`). Morgen accepts these directly — do not convert to UTC offsets.

Verify webhook delivery from Obsidian:
`curl http://localhost:8080/api/webhooks/deliveries`

## Project Structure (Modularity Rules)
The application MUST be strictly modular. Do not write routing or business logic directly inside `index.js`.
- `index.js` is strictly for: server configuration, `rawBody` capture middleware, signature verification middleware, and mounting routers.
- Feature logic must be split into dedicated controller files inside `/controllers`.
- Shared logic must live in the `utils/` directory.
> **Migration note**: Any existing `/handlers` directory is a legacy draft that does not conform to this spec. During Task 01, rename `/handlers` to `/controllers` and refactor the contents to match these rules before proceeding to any other task.

**Canonical Directory Tree:**
```text
.
├── index.js                # Server setup, rawBody middleware, signature verification, router mounting
├── package.json
├── .env
├── morgen-ids.json         # (Created dynamically) Persistent store for task path → Morgen ID mappings
├── active-session.json     # (Created dynamically) Ephemeral store for active Pomodoro session
├── controllers/            # Feature-specific webhook logic
│   ├── tasks.js            # Handles: task.created, task.updated, task.completed, task.deleted
│   └── time.js             # Handles: time.started, time.stopped
├── utils/                  # Shared core infrastructure
│   ├── store.js            # Atomic JSON read/write helpers (readJsonSafe, writeJsonAtomic)
│   ├── helpers.js          # Timezone and date string normalization helpers
│   └── api.js              # (Optional) Centralized Morgen API fetch wrapper
└── .gemini/                # AI agent context (You are here)
```

## Universal Architectural Rules

These rules apply to **all** handler implementations, refactors, and bug fixes. When reading existing code that violates these rules, treat the rule as correct and the code as wrong.

### 1. Response Timing
A `200 OK` response MUST be sent **before** any handler logic executes. TaskNotes does not wait for a response and will retry if one is not received promptly.

### 2. Signature Verification (CRITICAL)
The webhook signature is an HMAC-SHA256 hash. Verification MUST be performed against the **raw request body buffer** (`req.rawBody`).

```js
// CORRECT
const sig = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(req.rawBody)
  .digest('hex');
 
// WRONG — never do this. Key order in JSON.stringify is not guaranteed.
// const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
```

The `req.rawBody` buffer MUST be captured in `index.js` via an Express middleware placed before `express.json()`:
```js
app.use((req, _res, next) => {
  let data = [];
  req.on('data', chunk => data.push(chunk));
  req.on('end', () => { req.rawBody = Buffer.concat(data); next(); });
});
```

### 3. Task Identification
Always use `task.path` as the primary key for `morgen-ids.json`. `task.id` is absent during the `task.created` event.

### 4. Update Throttling
`task.updated` fires on every keystroke. You MUST diff the payload against `data.previous` before calling Morgen to prevent rate-limiting and API flooding. If no tracked fields changed, return early without any Morgen API call.

### 5. State Synchronization (Order of Operations)
NEVER update the local JSON store (`morgen-ids.json`) before receiving a successful `2xx` response from the Morgen API. If the API call fails, the local store must remain unchanged to prevent permanent desynchronization.

### 6. Atomic Storage
All writes to `morgen-ids.json` and `active-session.json` MUST use `writeJsonAtomic` from `utils/store.js`. Direct `fs.writeFileSync` on these files is forbidden — a crash mid-write corrupts the file permanently.

### 7. One-Way Data Flow
The server never calls the TaskNotes API to write data back to Obsidian. It only receives webhooks (reads) and calls the Morgen API (writes). Any code that POSTs or PATCHes to `TASKNOTES_API_URL` is a bug.

## Progressive Disclosure: Detailed Context

Do not guess data structures or edge case logic. Before starting any task, read the corresponding specification file:

- `.gemini/docs/roadmap.md` — Current roadmap, task statuses, and path to each task spec file.
- `.gemini/docs/tasks/` — Directory with isolated, step-by-step specifications for each task (01–07). Always read the full task file, not just the roadmap summary.
