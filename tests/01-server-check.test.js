const request = require('supertest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock Morgen API to prevent real requests
jest.mock('../utils/api', () => ({
  morgenRequest: jest.fn().mockResolvedValue({ data: { id: 'morgen-123' } }),
}));

// We still want to mock controllers for the foundation tests to keep them pure
// and avoid side effects of requiring the real ones too early.
// But later we will use real ones for logic testing.
jest.mock('../controllers/tasks', () => ({
  handleTaskCreated: jest.fn().mockResolvedValue(),
  handleTaskUpdated: jest.fn().mockResolvedValue(),
  handleTaskCompleted: jest.fn().mockResolvedValue(),
  handleTaskDeleted: jest.fn().mockResolvedValue(),
}));

jest.mock('../controllers/time', () => ({
  handleTimeStarted: jest.fn().mockResolvedValue(),
  handleTimeStopped: jest.fn().mockResolvedValue(),
}));

// Set required environment variables
process.env.WEBHOOK_SECRET = 'test-secret';
process.env.MORGEN_API_KEY = 'test-key';
process.env.MORGEN_ACCOUNT_ID = 'test-account';
process.env.MORGEN_CALENDAR_ID = 'test-calendar';
process.env.TIMEZONE = 'UTC';

// Import app (Expects index.js to export 'app')
const app = require('../index');

const { readJsonSafe, writeJsonAtomic } = require('../utils/store');
const { normalizeTaskDue, convertUtcToLocalMorgenFormat } = require('../utils/helpers');

describe('Task 01: Server Foundation Integration Tests', () => {

  describe('Storage Utility (utils/store.js)', () => {
    const testFilePath = path.join(__dirname, 'test-db.json');

    afterAll(() => {
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    });

    it('readJsonSafe should handle missing and malformed files', () => {
      expect(readJsonSafe('non-existent.json')).toEqual({});
      fs.writeFileSync(testFilePath, '{ invalid');
      expect(readJsonSafe(testFilePath)).toEqual({});
    });

    it('writeJsonAtomic should perform atomic writes', () => {
      const data = { test: 123 };
      writeJsonAtomic(testFilePath, data);
      expect(readJsonSafe(testFilePath)).toEqual(data);
    });
  });

  describe('Helper Utility (utils/helpers.js)', () => {
    it('normalizeTaskDue should handle various formats', () => {
      expect(normalizeTaskDue('2023-10-27')).toBe('2023-10-27T00:00:00');
      expect(normalizeTaskDue('2023-10-27 15:30')).toBe('2023-10-27 15:30:00');
      expect(normalizeTaskDue(null)).toBeNull();
    });

    it('convertUtcToLocalMorgenFormat should respect TIMEZONE env', () => {
      process.env.TIMEZONE = 'America/New_York';
      const utc = '2023-12-01T12:00:00Z';
      expect(convertUtcToLocalMorgenFormat(utc)).toBe('2023-12-01T07:00:00');
    });
  });

  describe('Webhook Foundation (index.js)', () => {
    const secret = 'test-secret';

    const getSignature = (payload) => {
      return crypto.createHmac('sha256', secret)
        .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
        .digest('hex');
    };

    it('should return 401 for missing signature', async () => {
      const response = await request(app).post('/webhook').send({});
      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid signature', async () => {
      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', 'bad-sig')
        .send({ event: 'task.created' });
      expect(response.status).toBe(401);
    });

    it('should return 200 and call controller for valid signature', async () => {
      const payload = { event: 'task.created', data: { path: 'test.md' } };
      const sig = getSignature(payload);

      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sig)
        .send(payload);
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      
      // Wait for async queue
      await new Promise(resolve => setTimeout(resolve, 50));
      const { handleTaskCreated } = require('../controllers/tasks');
      expect(handleTaskCreated).toHaveBeenCalled();
    });

    it('should return 400 for malformed JSON payload (Express default)', async () => {
      // Sending invalid JSON with correct content-type should trigger 400
      const response = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('X-TaskNotes-Signature', 'any')
        .send('{"invalid": json');
      
      expect(response.status).toBe(400);
    });
  });

  // Now we test the logic inside the controllers (already implemented in Task 01 by implementer)
  describe('Task Controller Logic (controllers/tasks.js)', () => {
    let tasks;
    let api;
    const MORGEN_IDS_FILE = path.join(__dirname, '..', 'morgen-ids.json');

    beforeEach(() => {
      jest.resetModules();
      // Re-mock everything to use actual logic but mock API
      jest.mock('../utils/api', () => ({
        morgenRequest: jest.fn().mockResolvedValue({ data: { id: 'morgen-123' } }),
      }));
      tasks = require('../controllers/tasks');
      api = require('../utils/api');
      
      // Clear store for each test
      if (fs.existsSync(MORGEN_IDS_FILE)) fs.unlinkSync(MORGEN_IDS_FILE);
    });

    afterAll(() => {
      if (fs.existsSync(MORGEN_IDS_FILE)) fs.unlinkSync(MORGEN_IDS_FILE);
    });

    it('handleTaskUpdated should return early if no changes detected (Rule 4)', async () => {
      const data = {
        task: { path: 't.md', title: 'T', status: 'todo', priority: 'medium' },
        previous: { path: 't.md', title: 'T', status: 'todo', priority: 'medium' }
      };
      
      // Mock store with existing ID
      writeJsonAtomic(MORGEN_IDS_FILE, { 't.md': 'm-1' });

      await tasks.handleTaskUpdated(data);
      
      expect(api.morgenRequest).not.toHaveBeenCalled();
    });

    it('handleTaskUpdated should use morgen_id from payload if missing in store (Self-healing)', async () => {
      const data = {
        task: { path: 't.md', title: 'T New', morgen_id: 'm-direct' },
        previous: { path: 't.md', title: 'T Old' }
      };

      await tasks.handleTaskUpdated(data);
      
      expect(api.morgenRequest).toHaveBeenCalledWith(
        'POST',
        '/tasks/update',
        expect.objectContaining({ id: 'm-direct', title: 'T New' })
      );
    });

    it('handleTaskUpdated should perform a rename in local store', async () => {
      writeJsonAtomic(MORGEN_IDS_FILE, { 'old.md': 'm-1' });
      
      const data = {
        task: { path: 'new.md', title: 'T' },
        previous: { path: 'old.md', title: 'T' }
      };

      await tasks.handleTaskUpdated(data);
      
      const store = readJsonSafe(MORGEN_IDS_FILE);
      expect(store['new.md']).toBe('m-1');
      expect(store['old.md']).toBeUndefined();
    });
  });
});
