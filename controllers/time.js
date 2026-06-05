const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('../utils/store');
const { convertUtcToLocalMorgenFormat } = require('../utils/helpers');
const { morgenRequest } = require('../utils/api');

const ACTIVE_SESSION_FILE = path.join(__dirname, '..', 'active-session.json');

async function handleTimeStarted(data) {
  const taskPath = data.task?.path || "";
  const taskTitle = data.task?.title || "Unknown task";
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
  const session = readJsonSafe(ACTIVE_SESSION_FILE);
  
  if (!session || Object.keys(session).length === 0) {
    console.log('[TIME] Session was never started (active-session.json empty).');
    return;
  }

  const taskTitle = session.taskTitle || data.task?.title || 'Work session';
  
  let totalMs = 0;
  const activePeriods = data.session?.activePeriods;
  if (Array.isArray(activePeriods) && activePeriods.length > 0) {
    activePeriods.forEach(p => {
      if (p.startTime && p.endTime) {
        totalMs += (new Date(p.endTime) - new Date(p.startTime));
      }
    });
  } else if (data.session?.startTime && data.session?.endTime) {
    totalMs = new Date(data.session.endTime) - new Date(data.session.startTime);
  }

  const durationMins = Math.max(1, Math.round(totalMs / 60000));
  const durationString = `PT${durationMins}M`;
  const startLocal = convertUtcToLocalMorgenFormat(data.session?.startTime || session.startTime);

  const payload = {
    accountId: process.env.MORGEN_ACCOUNT_ID,
    calendarId: process.env.MORGEN_CALENDAR_ID,
    title: `🍅 ${taskTitle}`,
    start: startLocal,
    duration: durationString,
    showWithoutTime: false,
    timeZone: process.env.TIMEZONE
  };

  try {
    const result = await morgenRequest('POST', '/events/create', payload);
    if (result) {
      const eventId = result.event?.id || result.data?.id || result.id;
      console.log(`[TIME] Morgen event created: ${eventId || 'OK'}`);
    }
  } catch (err) {
    console.error('[TIME] Failed to create Morgen event:', err.message);
  } finally {
    writeJsonAtomic(ACTIVE_SESSION_FILE, {});
    console.log('[TIME] Session stopped and cleared.');
  }
}

module.exports = {
  handleTimeStarted,
  handleTimeStopped
};
