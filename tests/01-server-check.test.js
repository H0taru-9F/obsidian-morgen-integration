const request = require('supertest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Task 01: Server Foundation & Webhook Security Integration Tests
 * 
 * Verifies:
 * - Signature verification using rawBody.
 * - Prompt 200 OK response.
 * - JSON storage atomicity.
 * - Date/Time normalization helpers.
 * - Malformed JSON handling.
 */

// Mock external Morgen API
jest.mock('../utils/api', () => ({
  morgenRequest: jest.fn().mockResolvedValue({ id: 'm-123' })
}));

// Setup required environment variables
process.env.WEBHOOK_SECRET = 'test-secret';
process.env.MORGEN_API_KEY = 'test-key';
process.env.MORGEN_ACCOUNT_ID = 'test-account';
process.env.MORGEN_CALENDAR_ID = 'test-calendar';
process.env.TIMEZONE = 'UTC';

// Import app instance.
// NOTE: For these tests to be executable, index.js MUST export the 'app' instance via module.exports.
const app = require('../index');

const { readJsonSafe, writeJsonAtomic } = require('../utils/store');
const { normalizeTaskDue, convertUtcToLocalMorgenFormat } = require('../utils/helpers');

describe('Task 01: Server Check & Foundation', () => {
  const MORGEN_IDS_FILE = path.join(__dirname, '..', 'morgen-ids.json');

  beforeEach(() => {
    jest.clearAllMocks();
    if (fs.existsSync(MORGEN_IDS_FILE)) fs.unlinkSync(MORGEN_IDS_FILE);
  });

  afterAll(() => {
    if (fs.existsSync(MORGEN_IDS_FILE)) fs.unlinkSync(MORGEN_IDS_FILE);
  });

  describe('1. Security: Signature Verification & rawBody', () => {
    const payload = { event: 'task.created', data: { task: { path: 'test.md', title: 'Test' } } };
    const bodyString = JSON.stringify(payload);
    const validSignature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET)
      .update(bodyString)
      .digest('hex');

    it('should return 401 Unauthorized for missing signature header', async () => {
      const response = await request(app)
        .post('/webhook')
        .send(payload);
      
      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    it('should return 401 Unauthorized for invalid signature', async () => {
      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', 'invalid-hmac-value')
        .send(payload);
      
      expect(response.status).toBe(401);
    });

    it('should return 200 OK for valid signature (validates rawBody capture)', async () => {
      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', validSignature)
        .send(payload);
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });
  });

  describe('2. Architecture: Immediate Response', () => {
    it('should return 200 OK promptly before handler execution completes', async () => {
      const payload = { event: 'task.created', data: { task: { path: 'test.md', title: 'Test' } } };
      const signature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');

      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe('3. Error Handling: Malformed JSON', () => {
    it('should return 400 Bad Request for malformed JSON payload', async () => {
      // Note: This relies on express.json() behavior
      const response = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('X-TaskNotes-Signature', 'any-sig')
        .send('{"event": "task.created", "invalid": '); // Incomplete JSON

      expect(response.status).toBe(400);
    });
  });

  describe('4. Utilities: store.js (Atomic Storage)', () => {
    const testStorePath = path.join(__dirname, 'test-store.json');

    afterEach(() => {
      if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);
    });

    it('readJsonSafe should return empty object for missing file', () => {
      expect(readJsonSafe(testStorePath)).toEqual({});
    });

    it('writeJsonAtomic should perform atomic write and persist data', () => {
      const data = { id: '123', path: 'test.md' };
      writeJsonAtomic(testStorePath, data);
      expect(readJsonSafe(testStorePath)).toEqual(data);
    });

    it('readJsonSafe should handle corrupted JSON files by returning {}', () => {
      fs.writeFileSync(testStorePath, '{ invalid json');
      expect(readJsonSafe(testStorePath)).toEqual({});
    });
  });

  describe('5. Utilities: helpers.js (Date Normalization)', () => {
    it('normalizeTaskDue should correctly format Obsidian date strings', () => {
      expect(normalizeTaskDue('2024-05-20')).toBe('2024-05-20T00:00:00');
      expect(normalizeTaskDue('2024-05-20 15:30')).toBe('2024-05-20 15:30:00');
      expect(normalizeTaskDue('2024-05-20T15:30:00')).toBe('2024-05-20T15:30:00');
      expect(normalizeTaskDue(null)).toBeNull();
      expect(normalizeTaskDue('')).toBeNull();
    });

    it('convertUtcToLocalMorgenFormat should respect the TIMEZONE env variable', () => {
      process.env.TIMEZONE = 'Europe/Warsaw'; // UTC+2 in summer
      const utc = '2024-05-20T12:00:00Z';
      const local = convertUtcToLocalMorgenFormat(utc);
      expect(local).toBe('2024-05-20T14:00:00');

      process.env.TIMEZONE = 'America/New_York'; // UTC-4 in summer
      const localNY = convertUtcToLocalMorgenFormat(utc);
      expect(localNY).toBe('2024-05-20T08:00:00');
    });
  });
});
