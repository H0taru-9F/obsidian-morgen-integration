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
    try { fs.unlinkSync(tmp); } catch { /* ignore cleanup error */ }
    throw err;
  }
}
 
module.exports = { readJsonSafe, writeJsonAtomic };
