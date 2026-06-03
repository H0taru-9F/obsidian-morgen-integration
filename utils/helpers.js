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
