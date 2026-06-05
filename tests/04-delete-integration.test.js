const request = require('supertest');
const crypto = require('crypto');

// Set up environment variables before requiring the app
process.env.WEBHOOK_SECRET = 'test-secret';
process.env.MORGEN_API_KEY = 'test-key';
process.env.MORGEN_ACCOUNT_ID = 'test-account';
process.env.MORGEN_CALENDAR_ID = 'test-calendar';
process.env.TIMEZONE = 'UTC';

// Mock the utilities
jest.mock('../utils/api');
jest.mock('../utils/store');

const app = require('../index');
const { morgenRequest } = require('../utils/api');
const { readJsonSafe, writeJsonAtomic } = require('../utils/store');

describe('Task 04: Delete Integration Tests', () => {
  const secret = process.env.WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const sign = (payload) => {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  };

  const flushPromises = () => new Promise(setImmediate);

  it('should return 401 for an invalid signature', async () => {
    const payload = { event: 'task.deleted', data: { task: { path: 'test.md' } } };
    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', 'invalid-sig')
      .send(payload);

    expect(response.status).toBe(401);
    expect(morgenRequest).not.toHaveBeenCalled();
  });

  it('should return 200 OK immediately and process task.deleted happy path', async () => {
    const taskPath = 'Work/test-task.md';
    const morgenId = 'm-123';
    const payload = {
      event: 'task.deleted',
      data: {
        task: {
          path: taskPath,
          title: 'Test Task'
        }
      }
    };

    // Mock store to have the mapping
    readJsonSafe.mockReturnValue({ [taskPath]: morgenId });
    // Mock successful Morgen API response
    morgenRequest.mockResolvedValue({ success: true });

    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');

    // Wait for the background processing queue
    await flushPromises();

    // Verify Morgen API call
    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/delete', { id: morgenId });

    // Verify mapping removal and atomic write
    expect(writeJsonAtomic).toHaveBeenCalled();
    const updatedStore = writeJsonAtomic.mock.calls[0][1];
    expect(updatedStore[taskPath]).toBeUndefined();
    expect(Object.keys(updatedStore)).toHaveLength(0);
  });

  it('should not call Morgen API if no mapping exists in store', async () => {
    const taskPath = 'Unknown/task.md';
    const payload = {
      event: 'task.deleted',
      data: {
        task: {
          path: taskPath,
          title: 'Unknown Task'
        }
      }
    };

    // Mock store to be empty
    readJsonSafe.mockReturnValue({});

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    await flushPromises();

    expect(morgenRequest).not.toHaveBeenCalled();
    expect(writeJsonAtomic).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(`Task not found in store, skipping deletion: ${taskPath}`)
    );
  });

  it('should not remove local mapping if Morgen API call fails (Rule 5)', async () => {
    const taskPath = 'Work/fail-task.md';
    const morgenId = 'm-fail';
    const payload = {
      event: 'task.deleted',
      data: {
        task: {
          path: taskPath,
          title: 'Fail Task'
        }
      }
    };

    // Mock store to have the mapping
    readJsonSafe.mockReturnValue({ [taskPath]: morgenId });
    // Mock Morgen API failure
    morgenRequest.mockResolvedValue(null);

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    await flushPromises();

    expect(morgenRequest).toHaveBeenCalled();
    // Rule 5: State Synchronization - MUST NOT update local store if API fails
    expect(writeJsonAtomic).not.toHaveBeenCalled();
  });

  it('should handle malformed JSON payload by returning 400', async () => {
    // Note: index.js uses express.json() which returns 400 on invalid JSON by default
    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('X-TaskNotes-Signature', 'some-sig')
      .send('{"invalid-json": ');

    expect(response.status).toBe(400);
  });
});
