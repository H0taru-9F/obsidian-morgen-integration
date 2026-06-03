require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const {
  handleTaskCreated,
  handleTaskUpdated,
  handleTaskCompleted,
  handleTaskDeleted
} = require('./controllers/tasks');

const {
  handleTimeStarted,
  handleTimeStopped
} = require('./controllers/time');

// 1. Initialization & Env Check
const requiredEnv = [
  'WEBHOOK_SECRET',
  'MORGEN_API_KEY',
  'MORGEN_ACCOUNT_ID',
  'MORGEN_CALENDAR_ID',
  'TIMEZONE'
];

const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`[ERR] Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

// 2. Express App Setup
const app = express();

// A. JSON parser with rawBody capture — uses the 'verify' option to get the buffer
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

// C. Global logger
app.use((req, res, next) => {
  if (req.url !== '/webhook') {
    console.log(`[REQ] ${req.method} ${req.url}`);
  }
  next();
});

// 3. Signature Verification Middleware
function verifySignature(req, res, next) {
  const signature = req.headers['x-tasknotes-signature'];
  if (!signature) {
    console.warn('[WARN] Missing X-TaskNotes-Signature header');
    return res.status(401).send('Unauthorized');
  }

  const expected = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(req.rawBody || Buffer.alloc(0))
    .digest('hex');

  const actual = signature || '';

  try {
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(actual);
    
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      console.warn(`[WARN] Invalid signature. Expected length: ${expectedBuf.length}, Actual length: ${actualBuf.length}`);
      return res.status(401).send('Unauthorized');
    }
  } catch (err) {
    console.warn('[WARN] Signature verification error:', err.message);
    return res.status(401).send('Unauthorized');
  }

  next();
}

// 4. Webhook Dispatcher
let processingQueue = Promise.resolve();

app.post('/webhook', verifySignature, (req, res) => {
  // Respond 200 OK immediately as per GEMINI.md rule 1
  res.status(200).send('OK');

  const { event, data } = req.body;

  // Process body asynchronously through a sequential queue to prevent storage race conditions
  processingQueue = processingQueue.then(async () => {
    try {
      console.log(`[EVENT] ${event}`);
      switch (event) {
        case 'task.created':
          await handleTaskCreated(data);
          break;
        case 'task.updated':
          await handleTaskUpdated(data);
          break;
        case 'task.completed':
          await handleTaskCompleted(data);
          break;
        case 'task.deleted':
          await handleTaskDeleted(data);
          break;
        case 'time.started':
          await handleTimeStarted(data);
          break;
        case 'time.stopped':
          await handleTimeStopped(data);
          break;
        default:
          console.log(`[DEBUG] Unhandled event type: ${event}`);
      }
    } catch (err) {
      console.error(`[ERR] Error processing event ${event}: ${err.message}`);
    }
  });
});

// 5. Server Lifecycle
app.listen(PORT, () => {
  console.log(`[INFO] Server listening on port ${PORT}`);
});
