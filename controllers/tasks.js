const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('../utils/store');
const { normalizeTaskDue } = require('../utils/helpers');
const { morgenRequest } = require('../utils/api');

const MORGEN_IDS_FILE = path.join(__dirname, '..', 'morgen-ids.json');

// Helper to map priority (Obsidian string to Morgen number)
function mapPriority(p) {
  const priority = String(p).toLowerCase();
  if (priority === 'highest' || priority === 'high') return 1;
  if (priority === 'medium') return 5;
  if (priority === 'low') return 9;
  return 0; // default/undefined
}

// Helper to map progress (Obsidian status to Morgen progress)
function mapProgress(status) {
  const s = String(status).toLowerCase();
  if (s === 'done' || s === 'completed') return 'completed';
  return 'needs-action';
}

// Helper to diff tasks (minimal for now, will be refined in Task 05)
function getTaskDiff(task, previous) {
  const diff = {};
  if (task.title !== previous.title) diff.title = task.title;
  if (task.scheduled !== previous.scheduled) diff.due = task.scheduled;
  if (task.priority !== previous.priority) diff.priority = mapPriority(task.priority);
  if (task.status !== previous.status) diff.progress = mapProgress(task.status);
  return Object.keys(diff).length > 0 ? diff : null;
}

async function handleTaskCreated(data) {
  const { task } = data;
  const due = normalizeTaskDue(task.scheduled);

  const payload = {
    title: task.title,
    ...(task.details && { description: task.details }),
    ...(due && { due }),
    priority: mapPriority(task.priority),
    progress: mapProgress(task.status),
  };

  const response = await morgenRequest('POST', '/tasks/create', payload);
  if (response && response.data && response.data.id) {
    const morgenId = response.data.id;
    const idStore = readJsonSafe(MORGEN_IDS_FILE);
    idStore[task.path] = morgenId;
    writeJsonAtomic(MORGEN_IDS_FILE, idStore);
    console.log(`[TASKS] Created Morgen task: ${morgenId} for ${task.path}`);
  }
}

async function handleTaskUpdated(data) {
  const { task, previous } = data;
  const idStore = readJsonSafe(MORGEN_IDS_FILE);
  let morgenId = idStore[task.path];

  // 1. Check for Rename
  if (task.path !== previous.path) {
    morgenId = idStore[previous.path];
    if (morgenId) {
      console.log(`[RENAME] ${previous.path} -> ${task.path}`);
      // idStore[task.path] = morgenId;
      // delete idStore[previous.path];
      // writeJsonAtomic(MORGEN_IDS_FILE, idStore);
      // defer local rename persistence until Morgen update succeeds
    }
  }

  // 2. Recover from payload if still missing (legacy support)
  if (!morgenId && task.morgen_id) {
    morgenId = task.morgen_id;
    // idStore[task.path] = morgenId;
    // writeJsonAtomic(MORGEN_IDS_FILE, idStore);
    // defer persistence until successful API response
  }

  // 3. Check for Field Changes
  const diff = getTaskDiff(task, previous);
  if (diff) {
    if (!morgenId) {
      console.warn(`[WARN] No morgenId found for update: ${task.path}`);
      return;
    }

    const updatePayload = {
      id: morgenId,
      ...diff
    };

    if (diff.due) {
      updatePayload.due = normalizeTaskDue(diff.due);
    }

    await morgenRequest('POST', '/tasks/update', updatePayload);

      // persist only after successful API call
        if (task.path !== previous.path && idStore[previous.path]) {
          idStore[task.path] = idStore[previous.path];
          delete idStore[previous.path];
          writeJsonAtomic(MORGEN_IDS_FILE, idStore);
        } else if (!idStore[task.path] && task.morgen_id) {
          idStore[task.path] = task.morgen_id;
          writeJsonAtomic(MORGEN_IDS_FILE, idStore);
        }

  }
}

async function handleTaskCompleted(data) {
  const { task } = data;
  const idStore = readJsonSafe(MORGEN_IDS_FILE);
  const morgenId = idStore[task.path];

  if (!morgenId) {
    console.warn(`[WARN] Task not found in store, skipping completion: ${task.path}`);
    return;
  }

  await morgenRequest('POST', '/tasks/close', { id: morgenId });
  console.log(`[TASKS] Completed Morgen task: ${morgenId}`);
}

async function handleTaskDeleted(data) {
  const { task } = data;
  const idStore = readJsonSafe(MORGEN_IDS_FILE);
  const morgenId = idStore[task.path];

  if (!morgenId) {
    console.warn(`[WARN] Task not found in store, skipping deletion: ${task.path}`);
    return;
  }

  const response = await morgenRequest('POST', '/tasks/delete', { id: morgenId });
  
  if (response) {
    delete idStore[task.path];
    writeJsonAtomic(MORGEN_IDS_FILE, idStore);
    console.log(`[TASKS] Deleted Morgen task: ${morgenId}`);
  }
}

module.exports = {
  handleTaskCreated,
  handleTaskUpdated,
  handleTaskCompleted,
  handleTaskDeleted
};
