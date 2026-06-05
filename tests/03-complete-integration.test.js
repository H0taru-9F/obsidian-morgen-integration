const request = require('supertest');
const crypto = require('crypto');
const app = require('../index');
const { morgenRequest } = require('../utils/api');
const { readJsonSafe } = require('../utils/store');

// Mock utilities
jest.mock('../utils/api');
jest.mock('../utils/store');

const WEBHOOK_SECRET = 'test-secret';

/**
 * Helper to sign the request body exactly as the server expects
 */
function sign(payload) {
  const body = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
}

describe('Task 03: Complete Integration Webhook Tests', () => {
  beforeAll(() => {
    // Set required env vars to prevent index.js from exiting
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.MORGEN_API_KEY = 'mock-api-key';
    process.env.MORGEN_ACCOUNT_ID = 'mock-account-id';
    process.env.MORGEN_CALENDAR_ID = 'mock-calendar-id';
    process.env.TIMEZONE = 'UTC';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation & Security', () => {
    it('should return 401 Unauthorized for an invalid signature', async () => {
      const payload = { event: 'task.completed', data: { task: { path: 'test.md' } } };
      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', 'invalid-hmac-signature')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    it('should return 400 Bad Request for malformed JSON', async () => {
      const response = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('X-TaskNotes-Signature', 'any-sig')
        .send('{"invalid": "json"'); // missing closing brace would be better, but supertest might help out. 
                                     // Actually '{"invalid": json' is truly malformed.
      
      expect(response.status).toBe(400);
    });
  });

  describe('Happy Path: task.completed', () => {
    it('should return 200 OK immediately and call Morgen close API', async () => {
      const payload = {
        event: 'task.completed',
        data: {
          task: { path: 'projects/task-a.md' }
        }
      };

      // Mock the store to return a valid Morgen ID mapping
      readJsonSafe.mockReturnValue({
        'projects/task-a.md': 'morgen-id-123'
      });

      // Mock Morgen API success
      morgenRequest.mockResolvedValue({ id: 'morgen-id-123' });

      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      // Verify Rule 1: Immediate 200 OK
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');

      // Wait for background processing (queue in index.js)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify Morgen API was called correctly
      expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/close', {
        id: 'morgen-id-123'
      });
    });
  });

  describe('Edge Case: Missing Mapping', () => {
    it('should log a warning and return early if morgen_id is not in store', async () => {
      const payload = {
        event: 'task.completed',
        data: {
          task: { path: 'unknown/task.md' }
        }
      };

      // Mock store as empty
      readJsonSafe.mockReturnValue({});
      
      // Spy on console.warn to verify warning log
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      expect(response.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify Morgen API was NOT called
      expect(morgenRequest).not.toHaveBeenCalled();
      
      // Verify warning log
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No Morgen ID found for completed task: unknown/task.md')
      );

      warnSpy.mockRestore();
    });
  });

  describe('Additional Requirements (Rule 4: Update Throttling)', () => {
    it('should not call Morgen API for task.updated with no changes', async () => {
      const payload = {
        event: 'task.updated',
        data: {
          task: { path: 'test.md', title: 'Task Title', status: 'todo' },
          previous: { path: 'test.md', title: 'Task Title', status: 'todo' }
        }
      };

      readJsonSafe.mockReturnValue({ 'test.md': 'm-123' });

      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      expect(response.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should return early and NOT call morgenRequest
      expect(morgenRequest).not.toHaveBeenCalled();
    });
  });
});
