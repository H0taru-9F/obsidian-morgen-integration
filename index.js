require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

const app    = express();
const port   = process.env.PORT   || 3000;
const secret = process.env.WEBHOOK_SECRET;

const MORGEN_API  = 'https://api.morgen.so/v3';
const MORGEN_KEY  = process.env.MORGEN_API_KEY;
const ACCOUNT_ID  = process.env.MORGEN_ACCOUNT_ID;
const CALENDAR_ID = process.env.MORGEN_CALENDAR_ID;
const TN_API      = process.env.TASKNOTES_API_URL || 'http://localhost:8080';

// --- Store: taskPath → morgenTaskId ---
const STORE_FILE = path.join(__dirname, 'morgen-ids.json');

function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

const idStore = loadStore();

// --- Morgen API helper ---
async function morgenRequest(endpoint, body) {
  const res = await fetch(`${MORGEN_API}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `ApiKey ${MORGEN_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Morgen ${endpoint} failed: ${JSON.stringify(data)}`);
  return data;
}

// --- Handlers ---

async function handleTaskCreated(task) {
  console.log(`[task.created] "${task.title}"`);

  const taskKey = task.path;
  const due = task.scheduled ? `${task.scheduled}T00:00:00` : null;

  const result = await morgenRequest('/tasks/create', {
    title: task.title,
    ...(due && { due }),
    ...(task.priority === 'high' && { priority: 1 }),
  });

  const morgenId = result?.data?.task?.id ?? result?.data?.id;
  if (!morgenId) {
    console.warn('[task.created] Morgen не повернув id, пропускаємо');
    return;
  }

  idStore[taskKey] = morgenId;
  saveStore(idStore);
  console.log(`[task.created] Збережено morgen_id=${morgenId} для ${taskKey}`);

  try {
    const tnRes = await fetch(
        `${TN_API}/api/tasks/${encodeURIComponent(taskKey)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ morgen_id: morgenId }),
        }
    );
    if (tnRes.ok) console.log('[task.created] morgen_id записано в TaskNotes');
    else console.warn('[task.created] TaskNotes відповів:', tnRes.status);
  } catch (e) {
    console.warn('[task.created] Не вдалося записати в TaskNotes:', e.message);
  }
}

async function handleTaskCompleted(task) {
  console.log(`[task.completed] "${task.title}"`);

  const morgenId = idStore[task.path] ?? task.morgen_id;
  if (!morgenId) {
    console.warn(`[task.completed] morgen_id не знайдено для ${task.path}`);
    return;
  }

  await morgenRequest('/tasks/close', { id: morgenId });
  console.log(`[task.completed] Закрито в Morgen: ${morgenId}`);
}

async function handlePomodoroCompleted(session, task) {
  console.log(`[pomodoro.completed] "${task.title}", ${session.plannedDuration} хв`);

  const startTime = d.toISOString().slice(0, 19);
  const duration  = `PT${session.plannedDuration}M`;

  await morgenRequest('/events/create', {
    accountId:   ACCOUNT_ID,
    calendarId:  CALENDAR_ID,
    title:       `🍅 ${task.title}`,
    start:       startTime,
    duration,
    showWithoutTime: false,
    timeZone:        'Europe/Warsaw',
    description: 'Pomodoro сесія з Obsidian TaskNotes',
  });

  console.log(`[pomodoro.completed] Подію створено: ${startTime} (${duration})`);
}

// --- Middleware ---

if (!secret) {
  console.error('WEBHOOK_SECRET не визначено');
  process.exit(1);
}

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- Webhook route ---

app.post('/webhook', async (req, res) => {
  const signature = req.get('X-TaskNotes-Signature');

  if (!signature) return res.status(401).send('Missing signature');

  const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

  if (signature !== expected) {
    console.warn('Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  res.status(200).send('OK');

  const { event, data } = req.body;

  try {
    switch (event) {
      case 'task.created':
        await handleTaskCreated(data.task);
        break;
      case 'task.completed':
        await handleTaskCompleted(data.task);
        break;
      case 'pomodoro.completed':
        await handlePomodoroCompleted(data.session, data.task);
        break;
      default:
        console.log(`[${event}] подія отримана, обробник не визначено`);
    }
  } catch (err) {
    console.error(`[${event}] Помилка:`, err.message);
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});