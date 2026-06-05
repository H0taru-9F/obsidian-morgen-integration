const request = require('supertest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = require('../index.js');
const { morgenRequest } = require('../utils/api.js');

// Mock the API helper
jest.mock('../utils/api.js', () => ({
  morgenRequest: jest.fn().mockResolvedValue({ success: true })
}));

const ACTIVE_SESSION_FILE = path.join(__dirname, '../active-session.json');
const SECRET = process.env.WEBHOOK_SECRET || 'test-secret';

/**
 * Helper to sign the payload with the same logic as the server.
 */
function sign(payload) {
  const body = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', SECRET)
    .update(body)
    .digest('hex');
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Task 07: Stop Time Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (fs.existsSync(ACTIVE_SESSION_FILE)) {
      fs.unlinkSync(ACTIVE_SESSION_FILE);
    }
    // Set environment variables for tests
    process.env.TIMEZONE = 'Europe/Warsaw';
    process.env.MORGEN_ACCOUNT_ID = 'acc-123';
    process.env.MORGEN_CALENDAR_ID = 'cal-123';
  });

  afterAll(() => {
    if (fs.existsSync(ACTIVE_SESSION_FILE)) {
      fs.unlinkSync(ACTIVE_SESSION_FILE);
    }
  });

  describe('Webhook Authentication', () => {
    it('should return 401 for an invalid signature', async () => {
      const payload = { event: 'time.stopped', data: {} };
      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', 'invalid-hmac')
        .send(payload);

      expect(response.status).toBe(401);
    });
  });

  describe('Event: time.stopped', () => {
    it('should return 200 OK and return early if active-session.json is missing', async () => {
      const payload = {
        event: 'time.stopped',
        data: {
          task: { title: 'Test Task' },
          session: {
            startTime: '2023-10-27T10:00:00.000Z',
            endTime: '2023-10-27T10:25:00.000Z'
          }
        }
      };

      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');

      await delay(50);
      expect(morgenRequest).not.toHaveBeenCalled();
    });

    it('should calculate duration correctly from activePeriods and create Morgen event', async () => {
      // Setup active session
      fs.writeFileSync(ACTIVE_SESSION_FILE, JSON.stringify({
        taskPath: 'path/to/task.md',
        taskTitle: 'My Task',
        startTime: '2023-10-27T10:00:00.000Z'
      }));

      const payload = {
        event: 'time.stopped',
        data: {
          task: { title: 'My Task', path: 'path/to/task.md' },
          session: {
            startTime: '2023-10-27T10:00:00.000Z',
            endTime: '2023-10-27T10:30:00.000Z',
            activePeriods: [
              { startTime: '2023-10-27T10:00:00.000Z', endTime: '2023-10-27T10:10:00.000Z' }, // 10m
              { startTime: '2023-10-27T10:15:00.000Z', endTime: '2023-10-27T10:25:00.000Z' }  // 10m
            ]
          }
        }
      };

      const response = await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      expect(response.status).toBe(200);
      await delay(50);

      expect(morgenRequest).toHaveBeenCalledWith('POST', '/events/create', expect.objectContaining({
        accountId: 'acc-123',
        calendarId: 'cal-123',
        title: '🍅 My Task',
        duration: 'PT20M',
        start: '2023-10-27T12:00:00', // Europe/Warsaw is UTC+2 in Oct
        timeZone: 'Europe/Warsaw',
        showWithoutTime: false
      }));

      // Check session cleanup
      const session = JSON.parse(fs.readFileSync(ACTIVE_SESSION_FILE, 'utf8'));
      expect(session).toEqual({});
    });

    it('should fallback to total session duration if activePeriods is missing or empty', async () => {
      fs.writeFileSync(ACTIVE_SESSION_FILE, JSON.stringify({
        taskTitle: 'Fallback Task',
        startTime: '2023-10-27T10:00:00.000Z'
      }));

      const payload = {
        event: 'time.stopped',
        data: {
          task: { title: 'Fallback Task' },
          session: {
            startTime: '2023-10-27T10:00:00.000Z',
            endTime: '2023-10-27T10:15:00.000Z'
            // Missing activePeriods
          }
        }
      };

      await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      await delay(50);

      expect(morgenRequest).toHaveBeenCalledWith('POST', '/events/create', expect.objectContaining({
        title: '🍅 Fallback Task',
        duration: 'PT15M'
      }));
    });

    it('should enforce minimum duration of PT1M and round to nearest minute', async () => {
      fs.writeFileSync(ACTIVE_SESSION_FILE, JSON.stringify({
        taskTitle: 'Short Task',
        startTime: '2023-10-27T10:00:00.000Z'
      }));

      const payload = {
        event: 'time.stopped',
        data: {
          session: {
            startTime: '2023-10-27T10:00:00.000Z',
            endTime: '2023-10-27T10:00:20.000Z' // 20 seconds -> PT1M
          }
        }
      };

      await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      await delay(50);

      expect(morgenRequest).toHaveBeenCalledWith('POST', '/events/create', expect.objectContaining({
        duration: 'PT1M'
      }));
    });

    it('should use "Work session" as fallback title if not in session file or payload', async () => {
      fs.writeFileSync(ACTIVE_SESSION_FILE, JSON.stringify({
        startTime: '2023-10-27T10:00:00.000Z'
        // Missing taskTitle
      }));

      const payload = {
        event: 'time.stopped',
        data: {
          session: {
            startTime: '2023-10-27T10:00:00.000Z',
            endTime: '2023-10-27T10:10:00.000Z'
          }
          // Missing task.title
        }
      };

      await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      await delay(50);

      expect(morgenRequest).toHaveBeenCalledWith('POST', '/events/create', expect.objectContaining({
        title: '🍅 Work session'
      }));
    });

    it('should clean up active-session.json even if Morgen API fails', async () => {
      morgenRequest.mockResolvedValueOnce(null);

      fs.writeFileSync(ACTIVE_SESSION_FILE, JSON.stringify({
        taskTitle: 'Fail Task',
        startTime: '2023-10-27T10:00:00.000Z'
      }));

      const payload = {
        event: 'time.stopped',
        data: {
          session: {
            startTime: '2023-10-27T10:00:00.000Z',
            endTime: '2023-10-27T10:10:00.000Z'
          }
        }
      };

      await request(app)
        .post('/webhook')
        .set('X-TaskNotes-Signature', sign(payload))
        .send(payload);

      await delay(50);

      expect(morgenRequest).toHaveBeenCalled();
      const session = JSON.parse(fs.readFileSync(ACTIVE_SESSION_FILE, 'utf8'));
      expect(session).toEqual({});
    });
  });

  describe('Edge Cases', () => {
    it('should return 400 for malformed JSON payload', async () => {
      const response = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('X-TaskNotes-Signature', 'any')
        .send('{"invalid":}');

      expect(response.status).toBe(400);
    });
  });
});
