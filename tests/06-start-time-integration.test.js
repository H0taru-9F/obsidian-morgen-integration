const request = require('supertest');
const crypto = require('crypto');
const path = require('path');

// Set up environment variables before requiring the app
process.env.WEBHOOK_SECRET = 'test-secret';
process.env.MORGEN_API_KEY = 'test-key';
process.env.MORGEN_ACCOUNT_ID = 'test-account';
process.env.MORGEN_CALENDAR_ID = 'test-calendar';
process.env.TIMEZONE = 'Europe/Warsaw';

// Mock the utilities
jest.mock('../utils/store');
jest.mock('../utils/api');

const app = require('../index');
const { writeJsonAtomic } = require('../utils/store');

describe('Task 06: Start Time Integration Tests', () => {
  const secret = process.env.WEBHOOK_SECRET;
  const ACTIVE_SESSION_FILE = path.join(__dirname, '..', 'active-session.json');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const sign = (payloadString) => {
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  };

  const flushPromises = () => new Promise(setImmediate);

  it('should return 401 for an invalid signature', async () => {
    const payload = { event: 'time.started', data: { session: { startTime: '2026-05-26T10:21:05.600Z' } } };
    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', 'invalid-sig')
      .send(payload);

    expect(response.status).toBe(401);
    expect(writeJsonAtomic).not.toHaveBeenCalled();
  });

  it('should return 400 for malformed JSON', async () => {
    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('X-TaskNotes-Signature', 'some-sig')
      .send('{"event": "time.started", "data": '); // Incomplete JSON

    expect(response.status).toBe(400);
  });

  it('should return 200 OK immediately and persist session data (Happy Path)', async () => {
    const payload = {
      event: 'time.started',
      data: {
        task: {
          path: '03-Projects/My Task.md',
          title: 'My Task'
        },
        session: {
          startTime: '2026-05-26T10:21:05.600Z'
        }
      }
    };
    const payloadString = JSON.stringify(payload);

    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payloadString))
      .set('Content-Type', 'application/json')
      .send(payloadString);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');

    await flushPromises();

    expect(writeJsonAtomic).toHaveBeenCalledWith(
      ACTIVE_SESSION_FILE,
      {
        taskPath: '03-Projects/My Task.md',
        taskTitle: 'My Task',
        startTime: '2026-05-26T10:21:05.600Z'
      }
    );
  });

  it('should use placeholders when task data is missing', async () => {
    const payload = {
      event: 'time.started',
      data: {
        session: {
          startTime: '2026-05-26T10:21:05.600Z'
        }
      }
    };
    const payloadString = JSON.stringify(payload);

    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payloadString))
      .set('Content-Type', 'application/json')
      .send(payloadString);

    expect(response.status).toBe(200);

    await flushPromises();

    expect(writeJsonAtomic).toHaveBeenCalledWith(
      ACTIVE_SESSION_FILE,
      {
        taskPath: '',
        taskTitle: 'Unknown task',
        startTime: '2026-05-26T10:21:05.600Z'
      }
    );
  });

  it('should log a warning and not update file if startTime is missing', async () => {
    const payload = {
      event: 'time.started',
      data: {
        task: {
          path: '03-Projects/My Task.md',
          title: 'My Task'
        },
        session: {
          // startTime is missing
        }
      }
    };
    const payloadString = JSON.stringify(payload);

    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payloadString))
      .set('Content-Type', 'application/json')
      .send(payloadString);

    expect(response.status).toBe(200);

    await flushPromises();

    expect(writeJsonAtomic).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('time.started event missing startTime')
    );
  });

  it('should verify signature correctly using rawBody capture', async () => {
    // This test specifically targets the express.json({ verify }) implementation
    // by ensuring that the signature generated from the raw payload matches.
    const payload = { event: 'time.started', data: { session: { startTime: 'now' } } };
    const payloadString = JSON.stringify(payload);
    
    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', sign(payloadString))
      .set('Content-Type', 'application/json')
      .send(payloadString);

    expect(response.status).toBe(200);
    // If it reached 200, the signature verification passed.
  });
});
