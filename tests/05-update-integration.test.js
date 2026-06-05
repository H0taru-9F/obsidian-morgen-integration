const request = require('supertest');
const crypto = require('crypto');

// Set up environment variables before requiring the app
process.env.WEBHOOK_SECRET = 'test-secret';
process.env.MORGEN_API_KEY = 'test-key';
process.env.MORGEN_ACCOUNT_ID = 'test-account';
process.env.MORGEN_CALENDAR_ID = 'test-calendar';
process.env.TIMEZONE = 'Europe/Warsaw';

// Mock the utilities
jest.mock('../utils/api');
jest.mock('../utils/store');

const app = require('../index');
const { morgenRequest } = require('../utils/api');
const { readJsonSafe, writeJsonAtomic } = require('../utils/store');

describe('Task 05: Update Integration Tests', () => {
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
    const payload = { event: 'task.updated', data: { task: { path: 'test.md' } } };
    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', 'invalid-sig')
      .send(payload);

    expect(response.status).toBe(401);
    expect(morgenRequest).not.toHaveBeenCalled();
  });

  it('should return 400 for malformed JSON', async () => {
    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('X-TaskNotes-Signature', 'some-sig')
      .send('{"event": "task.updated", "data": '); // Incomplete JSON

    expect(response.status).toBe(400);
  });

  it('should return 200 OK immediately and skip processing if no tracked fields changed (Throttling)', async () => {
    const taskPath = 'Work/test-task.md';
    const payload = {
      event: 'task.updated',
      data: {
        task: {
          path: taskPath,
          title: 'Same Title',
          priority: 'Medium',
          status: 'todo',
          scheduled: '2023-10-27'
        },
        previous: {
          path: taskPath,
          title: 'Same Title',
          priority: 'Medium',
          status: 'todo',
          scheduled: '2023-10-27'
        }
      }
    };

    readJsonSafe.mockReturnValue({ [taskPath]: 'm-123' });

    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    expect(response.status).toBe(200);
    await flushPromises();

    expect(morgenRequest).not.toHaveBeenCalled();
    expect(writeJsonAtomic).not.toHaveBeenCalled();
  });

  it('should sync changed fields to Morgen (Happy Path)', async () => {
    const taskPath = 'Work/test-task.md';
    const morgenId = 'm-123';
    const payload = {
      event: 'task.updated',
      data: {
        task: {
          path: taskPath,
          title: 'Updated Title',
          priority: 'High',
          status: 'todo',
          scheduled: '2023-10-27'
        },
        previous: {
          path: taskPath,
          title: 'Old Title',
          priority: 'Medium',
          status: 'todo',
          scheduled: '2023-10-27'
        }
      }
    };

    readJsonSafe.mockReturnValue({ [taskPath]: morgenId });
    morgenRequest.mockResolvedValue({ id: morgenId });

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    await flushPromises();

    // Verify Morgen update call with correct diff
    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/update', {
      id: morgenId,
      title: 'Updated Title',
      priority: 1 // High -> 1
    });

    // Since it's a simple update and mapping already exists, no write to disk
    expect(writeJsonAtomic).not.toHaveBeenCalled();
  });

  it('should handle rename by looking up old path and updating to new path', async () => {
    const oldPath = 'Work/old-name.md';
    const newPath = 'Work/new-name.md';
    const morgenId = 'm-123';
    const payload = {
      event: 'task.updated',
      data: {
        task: {
          path: newPath,
          title: 'New Name',
          priority: 'Medium',
          status: 'todo'
        },
        previous: {
          path: oldPath,
          title: 'Old Name',
          priority: 'Medium',
          status: 'todo'
        }
      }
    };

    // Store has mapping for old path
    readJsonSafe.mockReturnValue({ [oldPath]: morgenId });
    morgenRequest.mockResolvedValue({ id: morgenId });

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    await flushPromises();

    // Verify Morgen call (title change due to rename/filename change)
    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/update', {
      id: morgenId,
      title: 'New Name'
    });

    // Verify store update (Rule 5: only after success)
    expect(writeJsonAtomic).toHaveBeenCalled();
    const updatedStore = writeJsonAtomic.mock.calls[0][1];
    expect(updatedStore[newPath]).toBe(morgenId);
    expect(updatedStore[oldPath]).toBeUndefined();
  });

  it('should perform self-healing create if Morgen ID is missing from store', async () => {
    const taskPath = 'Work/missing-task.md';
    const newMorgenId = 'm-new-999';
    const payload = {
      event: 'task.updated',
      data: {
        task: {
          path: taskPath,
          title: 'Missing Task',
          priority: 'Low',
          status: 'todo',
          scheduled: '2023-12-25'
        },
        previous: {
          path: taskPath,
          title: 'Missing Task',
          priority: 'Low',
          status: 'todo',
          scheduled: '2023-12-24'
        }
      }
    };

    // Mock empty store
    readJsonSafe.mockReturnValue({});
    morgenRequest.mockResolvedValue({ id: newMorgenId });

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    await flushPromises();

    // Verify Morgen CREATE call instead of update
    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/create', expect.objectContaining({
      title: 'Missing Task',
      due: '2023-12-25T00:00:00',
      priority: 9
    }));

    // Verify store was updated with the new ID
    expect(writeJsonAtomic).toHaveBeenCalled();
    const updatedStore = writeJsonAtomic.mock.calls[0][1];
    expect(updatedStore[taskPath]).toBe(newMorgenId);
  });

  it('should clear due date in Morgen when scheduled becomes null', async () => {
    const taskPath = 'Work/test-task.md';
    const morgenId = 'm-123';
    const payload = {
      event: 'task.updated',
      data: {
        task: {
          path: taskPath,
          title: 'Task Title',
          priority: 'Medium',
          status: 'todo',
          scheduled: null
        },
        previous: {
          path: taskPath,
          title: 'Task Title',
          priority: 'Medium',
          status: 'todo',
          scheduled: '2023-10-27'
        }
      }
    };

    readJsonSafe.mockReturnValue({ [taskPath]: morgenId });
    morgenRequest.mockResolvedValue({ id: morgenId });

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    await flushPromises();

    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/update', {
      id: morgenId,
      due: null
    });
  });

  it('should NOT update local store if Morgen API call fails (Rule 5)', async () => {
    const oldPath = 'Work/rename-fail.md';
    const newPath = 'Work/renamed.md';
    const morgenId = 'm-123';
    const payload = {
      event: 'task.updated',
      data: {
        task: { path: newPath, title: 'Renamed' },
        previous: { path: oldPath, title: 'Old' }
      }
    };

    readJsonSafe.mockReturnValue({ [oldPath]: morgenId });
    // API Failure
    morgenRequest.mockResolvedValue(null);

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    await flushPromises();

    expect(morgenRequest).toHaveBeenCalled();
    // Should NOT have updated the store because API failed
    expect(writeJsonAtomic).not.toHaveBeenCalled();
  });

  it('should recover Morgen ID from payload if missing from store', async () => {
    const taskPath = 'Work/payload-id-task.md';
    const morgenIdFromPayload = 'm-from-payload';
    const payload = {
      event: 'task.updated',
      data: {
        task: {
          path: taskPath,
          title: 'Updated Title',
          morgen_id: morgenIdFromPayload
        },
        previous: {
          path: taskPath,
          title: 'Old Title'
        }
      }
    };

    // Store is empty
    readJsonSafe.mockReturnValue({});
    morgenRequest.mockResolvedValue({ id: morgenIdFromPayload });

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payload))
      .send(payload);

    await flushPromises();

    // Verify Morgen update call used the ID from payload
    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/update', {
      id: morgenIdFromPayload,
      title: 'Updated Title'
    });

    // Verify store was updated with the ID recovered from payload
    expect(writeJsonAtomic).toHaveBeenCalled();
    const updatedStore = writeJsonAtomic.mock.calls[0][1];
    expect(updatedStore[taskPath]).toBe(morgenIdFromPayload);
  });
});
