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

// Helper to diff tasks (Task 05)
function getTaskDiff(task, previous) {
  const prev = previous || {};
  const diff = {};

  if (task.title !== prev.title) diff.title = task.title;

  const currentDue = normalizeTaskDue(task.scheduled);
  const prevDue = normalizeTaskDue(prev.scheduled);
  if (currentDue !== prevDue) {
    diff.due = currentDue; // Works for null to clear date too
  }

  const currentPriority = mapPriority(task.priority);
  const prevPriority = mapPriority(prev.priority);
  if (currentPriority !== prevPriority) {
    diff.priority = currentPriority;
  }

  const currentProgress = mapProgress(task.status);
  const prevProgress = mapProgress(prev.status);
  if (currentProgress !== prevProgress) {
    diff.progress = currentProgress;
  }

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
  if (response && response.id) {
    const morgenId = response.id;
    const idStore = readJsonSafe(MORGEN_IDS_FILE);
    idStore[task.path] = morgenId;
    writeJsonAtomic(MORGEN_IDS_FILE, idStore);
    console.log(`[TASKS] Created Morgen task: ${morgenId} for ${task.path}`);
  }
}

async function handleTaskUpdated(data) {
  const { task, previous } = data;
  const idStore = readJsonSafe(MORGEN_IDS_FILE);
  const isRename = previous && task.path !== previous.path;

  // 1. Resolve Morgen ID
  let morgenId = isRename ? idStore[previous.path] : idStore[task.path];

  // 1b. Recovery from payload
  if (!morgenId && task.morgen_id) {
    morgenId = task.morgen_id;
  }

  // 2. Rule 4: Update Throttling (Diff checking)
  const diff = getTaskDiff(task, previous);
  if (!diff && !isRename) {
    return; // No tracked changes, skip
  }

  // 3. Fallback: Create Mode (if still no ID)
  if (!morgenId) {
    console.log(`[TASKS] Self-healing: Creating missing task for ${task.path}`);
    const due = normalizeTaskDue(task.scheduled);
    const createPayload = {
      title: task.title,
      ...(task.details && { description: task.details }),
      ...(due && { due }),
      priority: mapPriority(task.priority),
      progress: mapProgress(task.status),
    };

    const response = await morgenRequest('POST', '/tasks/create', createPayload);
    if (response && response.id) {
      idStore[task.path] = response.id;
      writeJsonAtomic(MORGEN_IDS_FILE, idStore);
      console.log(`[TASKS] Self-healing success: ${response.id}`);
    }
    return;
  }

  // 4. Update Mode
  const updatePayload = {
    id: morgenId,
    ...(diff || {})
  };

  const response = await morgenRequest('POST', '/tasks/update', updatePayload);
  if (response) {
    // 5. Persistence (Order of Operations)
    let storeUpdated = false;
    if (isRename) {
      idStore[task.path] = morgenId;
      delete idStore[previous.path];
      storeUpdated = true;
    } else if (!idStore[task.path] && task.morgen_id) {
      idStore[task.path] = task.morgen_id;
      storeUpdated = true;
    }

    if (storeUpdated) {
      writeJsonAtomic(MORGEN_IDS_FILE, idStore);
      console.log(`[TASKS] Local store updated for ${task.path}`);
    }
    console.log(`[TASKS] Synced update for ${morgenId}`);
  }
}

async function handleTaskCompleted(data) {
  const { task } = data;
  const idStore = readJsonSafe(MORGEN_IDS_FILE);
  const morgenId = idStore[task.path];

  if (morgenId) {
    const response = await morgenRequest('POST', '/tasks/close', { id: morgenId });
    if (response !== null) {
      console.log(`[TASKS] Completed Morgen task: ${morgenId}`);
    }
  } else {
    console.warn(`[WARN] No Morgen ID found for completed task: ${task.path}`);
  }
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
