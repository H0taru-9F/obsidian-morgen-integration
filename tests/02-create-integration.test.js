process.env.WEBHOOK_SECRET = 'test-secret';
process.env.MORGEN_API_KEY = 'test-key';
process.env.MORGEN_ACCOUNT_ID = 'test-acc';
process.env.MORGEN_CALENDAR_ID = 'test-cal';
process.env.TIMEZONE = 'UTC';

const request = require('supertest');
const crypto = require('crypto');
const app = require('../index');
const { morgenRequest } = require('../utils/api');
const { writeJsonAtomic, readJsonSafe } = require('../utils/store');

// Mock external dependencies to avoid actual API calls and file I/O
jest.mock('../utils/api');
jest.mock('../utils/store');

describe('Task 02: Create Integration Integration Tests', () => {
  const secret = 'test-secret';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper to sign a payload with HMAC-SHA256
   */
  function getSignature(payload) {
    return crypto.createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  it('should return 401 Unauthorized for an invalid signature', async () => {
    const body = JSON.stringify({ event: 'task.created', data: { task: { title: 'Test' } } });
    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', 'invalid-hmac')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(401);
    expect(morgenRequest).not.toHaveBeenCalled();
  });

  it('should return 401 Unauthorized when signature header is missing', async () => {
    const body = JSON.stringify({ event: 'task.created', data: { task: { title: 'Test' } } });
    const response = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(401);
  });

  it('should return 400 Bad Request for malformed JSON payload (invalid syntax)', async () => {
    const malformedJson = '{"event": "task.created", "data": { "task": { "title": "Fail" }'; // Missing closing brace
    const signature = getSignature(malformedJson);

    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(malformedJson);

    expect(response.status).toBe(400);
  });

  it('should return 200 OK and process task.created successfully (Happy Path)', async () => {
    const bodyObj = {
      event: 'task.created',
      data: {
        task: {
          path: 'Work/Project.md',
          title: 'Finish Integration',
          details: 'Complete all steps',
          scheduled: '2023-11-15',
          priority: 'high',
          status: 'todo'
        }
      }
    };
    const body = JSON.stringify(bodyObj);
    const signature = getSignature(body);

    morgenRequest.mockResolvedValueOnce({ id: 'm-123' });
    readJsonSafe.mockReturnValueOnce({});

    const response = await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/create', {
      title: 'Finish Integration',
      description: 'Complete all steps',
      due: '2023-11-15T00:00:00',
      priority: 1,
      progress: 'needs-action'
    });

    expect(writeJsonAtomic).toHaveBeenCalledWith(
      expect.stringContaining('morgen-ids.json'),
      { 'Work/Project.md': 'm-123' }
    );
  });

  it('should omit description and due when optional fields are missing', async () => {
    const bodyObj = {
      event: 'task.created',
      data: {
        task: {
          path: 'Inbox.md',
          title: 'Minimal Task',
          priority: 'medium',
          status: 'todo'
        }
      }
    };
    const body = JSON.stringify(bodyObj);
    const signature = getSignature(body);

    morgenRequest.mockResolvedValueOnce({ id: 'm-456' });
    readJsonSafe.mockReturnValueOnce({});

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/create', {
      title: 'Minimal Task',
      priority: 5,
      progress: 'needs-action'
    });
  });

  it('should NOT update local store if Morgen API returns error (null)', async () => {
    const bodyObj = {
      event: 'task.created',
      data: {
        task: { path: 'Error.md', title: 'Error' }
      }
    };
    const body = JSON.stringify(bodyObj);
    const signature = getSignature(body);

    morgenRequest.mockResolvedValueOnce(null);

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(writeJsonAtomic).not.toHaveBeenCalled();
  });

  it('should return early on task.updated with no actual changes', async () => {
    const bodyObj = {
      event: 'task.updated',
      data: {
        task: { path: 'Same.md', title: 'Same', priority: 'medium', status: 'todo' },
        previous: { path: 'Same.md', title: 'Same', priority: 'medium', status: 'todo' }
      }
    };
    const body = JSON.stringify(bodyObj);
    const signature = getSignature(body);

    readJsonSafe.mockReturnValueOnce({ 'Same.md': 'm-same' });

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Should not call Morgen if no tracked fields changed (GEMINI.md Rule 4)
    expect(morgenRequest).not.toHaveBeenCalled();
  });

  it('should handle missing morgen_id in idStore mapping during update', async () => {
    // This tests the "Self-healing" or "Missing morgen_id" case
    const bodyObj = {
      event: 'task.updated',
      data: {
        task: { path: 'NewPath.md', title: 'New', priority: 'medium', status: 'todo' },
        previous: { path: 'NewPath.md', title: 'New', priority: 'medium', status: 'todo' }
      }
    };
    // Force a change to trigger update logic, but leave ID missing
    bodyObj.data.task.title = 'Changed';
    
    const body = JSON.stringify(bodyObj);
    const signature = getSignature(body);

    readJsonSafe.mockReturnValueOnce({}); // Empty store

    await request(app)
      .post('/webhook')
      .set('X-TaskNotes-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(body);

    await new Promise(resolve => setTimeout(resolve, 50));

    // The handler should attempt to "self-heal" by creating the task if no ID found
    expect(morgenRequest).toHaveBeenCalledWith('POST', '/tasks/create', expect.any(Object));
  });
});
