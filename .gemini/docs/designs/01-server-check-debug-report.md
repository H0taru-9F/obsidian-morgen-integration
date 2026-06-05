# Debug Report: 01-server-check

## Test Suite Summary
- Total Tests: 10
- Passed: ✅ 5
- Failed: ❌ 5

## Failed Test Cases & Error Logs

### Security: Signature Verification & rawBody
- `should return 401 Unauthorized for missing signature header`
- `should return 401 Unauthorized for invalid signature`
- `should return 200 OK for valid signature (validates rawBody capture)`

### Architecture: Immediate Response
- `should return 200 OK promptly before handler execution completes`

### Error Handling: Malformed JSON
- `should return 400 Bad Request for malformed JSON payload`

**Error Log (Typical for all above):**
```
TypeError: app.address is not a function
    at Test.serverAddress (node_modules/supertest/lib/test.js:61:22)
    at new Test (node_modules/supertest/lib/test.js:49:14)
    at Object.obj.<computed> [as post] (node_modules/supertest/index.js:40:18)
    at Object.post (tests/01-server-check.test.js:58:10)
```

**Additional Observations:**
- Jest failed to exit after the test run.
- Console output showed: `Cannot log after tests are done. Attempted to log "[INFO] Server listening on port 3000".`
- Exit Code: 1 (due to test failures and open handles).

## Hypotheses
- **Most likely cause:** `index.js` does not export the `app` instance. When the test suite executes `const app = require('../index')`, it receives an empty object `{}`. Supertest expects an Express app or a Node.js `http.Server` object that has an `.address()` method.
- **Secondary issue:** `index.js` calls `app.listen(PORT, ...)` unconditionally at the top level. This causes the server to start automatically when the file is required for testing. This leads to:
    1. Port conflicts (`EADDRINUSE`) if the port is already occupied.
    2. Open handles that prevent Jest from exiting cleanly.
    3. Race conditions where the server starts and logs after Jest has already begun reporting results.

## Fix Plan (for Implementer)
1. Wrap the `app.listen` call in `index.js` inside a check for `require.main === module` to ensure it only runs when the script is executed directly, not when required as a module.
2. Add `module.exports = app;` at the end of `index.js`.

## What I cannot see
- Whether there are other environment-specific issues that might occur once the app is correctly exported (e.g., Morgen API key validation logic if it were actually called).
- Potential issues with `rawBody` capture if `express.json()` with `verify` is not sufficient for all types of payloads (though it should be for JSON).
