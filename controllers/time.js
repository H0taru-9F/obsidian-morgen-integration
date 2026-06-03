const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('../utils/store');
const { convertUtcToLocalMorgenFormat } = require('../utils/helpers');
const { morgenRequest } = require('../utils/api');

const ACTIVE_SESSION_FILE = path.join(__dirname, '..', 'active-session.json');

// Helper to calculate duration in minutes from activePeriods
function calculateActiveDuration(periods) {
  let totalMs = 0;
  periods.forEach(p => {
    if (p.startTime && p.endTime) {
      totalMs += (new Date(p.endTime) - new Date(p.startTime));
    }
  });
  return Math.round(totalMs / 60000);
}

// Helper to format duration for Morgen (e.g. "PT30M")
function formatMorgenDuration(mins) {
  return `PT${mins}M`;
}

async function handleTimeStarted(data) {
  const taskPath = data.task?.path || null;
  const taskTitle = data.task?.title || "Work session";
  const startTime = data.session?.startTime;

  if (!startTime) {
    console.warn('[TIME] time.started event missing startTime');
    return;
  }

  const session = { taskPath, taskTitle, startTime };
  writeJsonAtomic(ACTIVE_SESSION_FILE, session);
  console.log(`[TIME] Session started: ${taskTitle} (${taskPath || 'no task'})`);
}

async function handleTimeStopped(data) {
  let session = readJsonSafe(ACTIVE_SESSION_FILE);
  
  if (!session || Object.keys(session).length === 0) {
    if (data.task) {
      session = {
        taskTitle: data.task.title,
        taskPath: data.task.path,
        startTime: data.session?.startTime
      };
    } else {
      console.warn('[TIME] No active session found and no task in payload. Aborting.');
      return;
    }
  }

  const activePeriods = data.session?.activePeriods;
  if (!activePeriods || activePeriods.length === 0) {
    console.warn('[TIME] No active periods in session. Aborting.');
    return;
  }

  const durationMins = calculateActiveDuration(activePeriods);
  const start = convertUtcToLocalMorgenFormat(activePeriods[0].startTime);
  const duration = formatMorgenDuration(durationMins);

  const payload = {
    accountId: process.env.MORGEN_ACCOUNT_ID,
    calendarId: process.env.MORGEN_CALENDAR_ID,
    title: `🍅 ${session.taskTitle}`,
    start,
    duration,
    showWithoutTime: false,
    timeZone: process.env.TIMEZONE
  };

  const result = await morgenRequest('POST', '/events/create', payload);

  if (result) {
    const eventId = result.event?.id || result.data?.id || result.id;
    console.log(`[TIME] Morgen event created: ${eventId || 'OK'}`);
  }

  // Cleanup session
  writeJsonAtomic(ACTIVE_SESSION_FILE, {});
}

module.exports = {
  handleTimeStarted,
  handleTimeStopped
};
