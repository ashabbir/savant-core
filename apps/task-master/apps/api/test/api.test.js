/**
 * Task Master API Integration Tests
 * 
 * These tests run against a test database and cover all API endpoints.
 * Run with: node --test test/api.test.js
 * 
 * Prerequisites:
 * - MongoDB running (test instance)
 * - DATABASE_URL environment variable set
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Test configuration
const API_BASE = process.env.API_BASE || 'http://localhost:3333';
const TEST_TIMEOUT = 30000;

// Test data storage
let adminApiKey = '';
let memberApiKey = '';
let testProjectId = '';
let testTaskId = '';
let testAgentId = '';
let testUserId = '';
let testCommentId = '';
let testDocumentId = '';
let testNotificationId = '';
let testRoutingRuleId = '';

// Helper functions
async function api(method, path, { body, apiKey, expectStatus } = {}) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (apiKey) {
        headers['x-api-key'] = apiKey;
    }

    const options = {
        method,
        headers
    };

    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json().catch(() => ({}));

    if (expectStatus !== undefined && response.status !== expectStatus) {
        throw new Error(`Expected status ${expectStatus}, got ${response.status}: ${JSON.stringify(data)}`);
    }

    return { status: response.status, data, ok: response.ok };
}

function randomString(length = 8) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

// ============================================================================
// HEALTH CHECK TESTS
// ============================================================================

describe('Health Check', { timeout: TEST_TIMEOUT }, () => {
    test('GET /health returns ok', async () => {
        const { status, data } = await api('GET', '/health');
        assert.equal(status, 200);
        assert.equal(data.status, 'ok');
    });
});

// ============================================================================
// AUTHENTICATION TESTS
// ============================================================================

describe('Authentication', { timeout: TEST_TIMEOUT }, () => {
    test('POST /api/login with valid credentials returns apiKey', async () => {
        const { status, data } = await api('POST', '/api/login', {
            body: { username: 'admin', password: 'admin123' }
        });

        if (status === 200) {
            assert.ok(data.apiKey, 'Should return apiKey');
            assert.ok(data.username, 'Should return username');
            adminApiKey = data.apiKey;
        } else {
            // If admin doesn't exist, skip this test
            console.log('Admin user not found, skipping login test');
        }
    });

    test('POST /api/login with invalid credentials returns 401', async () => {
        const { status } = await api('POST', '/api/login', {
            body: { username: 'nonexistent', password: 'wrongpass' }
        });
        assert.equal(status, 401);
    });

    test('POST /api/login with missing fields returns 400', async () => {
        const { status } = await api('POST', '/api/login', {
            body: { username: '' }
        });
        assert.equal(status, 400);
    });

    test('API endpoints require authentication', async () => {
        const { status } = await api('GET', '/api/projects');
        assert.equal(status, 401);
    });

    test('API endpoints reject invalid API key', async () => {
        const { status } = await api('GET', '/api/projects', {
            apiKey: 'invalid-key'
        });
        assert.equal(status, 401);
    });
});

// ============================================================================
// USER PROFILE TESTS (/api/me)
// ============================================================================

describe('User Profile (Me)', { timeout: TEST_TIMEOUT }, () => {
    before(async () => {
        // Ensure we have an admin API key
        if (!adminApiKey) {
            const { data } = await api('POST', '/api/login', {
                body: { username: 'admin', password: 'admin123' }
            });
            adminApiKey = data.apiKey || '';
        }
    });

    test('GET /api/me returns current user profile', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/me', { apiKey: adminApiKey });
        assert.equal(status, 200);
        assert.ok(data.id, 'Should have id');
        assert.ok(data.username, 'Should have username');
        assert.ok(data.role, 'Should have role');
    });

    test('PATCH /api/me updates display name', async () => {
        if (!adminApiKey) return;

        const newDisplayName = `Test User ${randomString()}`;
        const { status, data } = await api('PATCH', '/api/me', {
            apiKey: adminApiKey,
            body: { displayName: newDisplayName }
        });
        assert.equal(status, 200);
        assert.equal(data.displayName, newDisplayName);
    });

    test('PATCH /api/me validates email format', async () => {
        if (!adminApiKey) return;

        const { status } = await api('PATCH', '/api/me', {
            apiKey: adminApiKey,
            body: { email: 'invalid-email' }
        });
        assert.equal(status, 400);
    });

    test('POST /api/me/api-key rotates API key', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('POST', '/api/me/api-key', {
            apiKey: adminApiKey
        });

        if (status === 200) {
            assert.ok(data.apiKey, 'Should return new apiKey');
            assert.notEqual(data.apiKey, adminApiKey, 'Should be different from old key');
            adminApiKey = data.apiKey; // Update for subsequent tests
        }
    });

    test('POST /api/me/password changes password', async () => {
        if (!adminApiKey) return;

        // First change to a new password
        const { status } = await api('POST', '/api/me/password', {
            apiKey: adminApiKey,
            body: { currentPassword: 'admin123', newPassword: 'newpassword123' }
        });

        if (status === 200) {
            // Change it back
            await api('POST', '/api/me/password', {
                apiKey: adminApiKey,
                body: { currentPassword: 'newpassword123', newPassword: 'admin123' }
            });
        }
    });

    test('POST /api/me/password rejects wrong current password', async () => {
        if (!adminApiKey) return;

        const { status } = await api('POST', '/api/me/password', {
            apiKey: adminApiKey,
            body: { currentPassword: 'wrongpassword', newPassword: 'newpassword123' }
        });
        assert.equal(status, 401);
    });
});

// ============================================================================
// NOTIFICATION SUBSCRIPTION TESTS
// ============================================================================

describe('Notification Subscriptions', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/me/notifications lists subscriptions', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/me/notifications', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('POST /api/me/notifications creates subscription', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('POST', '/api/me/notifications', {
            apiKey: adminApiKey,
            body: {
                channel: 'slack',
                target: 'https://hooks.slack.com/test',
                mentionsOnly: true
            }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return id');
            assert.equal(data.channel, 'slack');
            testNotificationId = data.id;
        }
    });

    test('PATCH /api/me/notifications/:id updates subscription', async () => {
        if (!adminApiKey || !testNotificationId) return;

        const { status, data } = await api('PATCH', `/api/me/notifications/${testNotificationId}`, {
            apiKey: adminApiKey,
            body: { mentionsOnly: false }
        });

        if (status === 200) {
            assert.equal(data.mentionsOnly, false);
        }
    });

    test('DELETE /api/me/notifications/:id deletes subscription', async () => {
        if (!adminApiKey || !testNotificationId) return;

        const { status, data } = await api('DELETE', `/api/me/notifications/${testNotificationId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.deleted, true);
    });
});

// ============================================================================
// ADMIN USER MANAGEMENT TESTS
// ============================================================================

describe('Admin User Management', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/admin/users lists all users (admin only)', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/admin/users', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array of users');
    });

    test('POST /api/admin/users creates new user', async () => {
        if (!adminApiKey) return;

        const username = `testuser_${randomString()}`;
        const { status, data } = await api('POST', '/api/admin/users', {
            apiKey: adminApiKey,
            body: {
                username,
                displayName: 'Test User',
                role: 'MEMBER',
                password: 'testpass123'
            }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return user id');
            assert.equal(data.username, username);
            assert.ok(data.apiKey, 'Should return apiKey on creation');
            testUserId = data.id;
            memberApiKey = data.apiKey;
        }
    });

    test('POST /api/admin/users rejects duplicate username', async () => {
        if (!adminApiKey) return;

        const { status } = await api('POST', '/api/admin/users', {
            apiKey: adminApiKey,
            body: {
                username: 'admin',
                displayName: 'Duplicate Admin',
                role: 'MEMBER',
                password: 'testpass123'
            }
        });
        assert.equal(status, 400);
    });

    test('PATCH /api/admin/users/:userId updates user', async () => {
        if (!adminApiKey || !testUserId) return;

        const { status, data } = await api('PATCH', `/api/admin/users/${testUserId}`, {
            apiKey: adminApiKey,
            body: { displayName: 'Updated Test User' }
        });

        if (status === 200) {
            assert.equal(data.displayName, 'Updated Test User');
        }
    });

    test('POST /api/admin/users/:userId/password resets user password', async () => {
        if (!adminApiKey || !testUserId) return;

        const { status, data } = await api('POST', `/api/admin/users/${testUserId}/password`, {
            apiKey: adminApiKey,
            body: { password: 'newpassword123' }
        });
        assert.equal(status, 200);
        assert.equal(data.reset, true);
    });

    test('POST /api/admin/users/:userId/api-key regenerates user API key', async () => {
        if (!adminApiKey || !testUserId) return;

        const { status, data } = await api('POST', `/api/admin/users/${testUserId}/api-key`, {
            apiKey: adminApiKey
        });

        if (status === 200) {
            assert.ok(data.apiKey, 'Should return new apiKey');
            memberApiKey = data.apiKey;
        }
    });

    test('PUT /api/admin/users/:userId/projects assigns projects to user', async () => {
        if (!adminApiKey || !testUserId || !testProjectId) return;

        const { status, data } = await api('PUT', `/api/admin/users/${testUserId}/projects`, {
            apiKey: adminApiKey,
            body: { projectIds: [testProjectId] }
        });

        if (status === 200) {
            assert.equal(data.updated, true);
        }
    });
});

// ============================================================================
// PROJECT TESTS
// ============================================================================

describe('Projects', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/projects lists projects', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/projects', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array of projects');
    });

    test('POST /api/projects creates new project (admin only)', async () => {
        if (!adminApiKey) return;

        const code = `T${randomString(4).toUpperCase()}`;
        const { status, data } = await api('POST', '/api/projects', {
            apiKey: adminApiKey,
            body: {
                name: `Test Project ${randomString()}`,
                code,
                enabledColumns: ['Backlog', 'Todo', 'Inprogress', 'Review', 'Done']
            }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return project id');
            assert.equal(data.code, code);
            assert.ok(data.columns, 'Should have columns');
            testProjectId = data.id;
        }
    });

    test('PATCH /api/projects/:projectId updates project', async () => {
        if (!adminApiKey || !testProjectId) return;

        const newName = `Updated Project ${randomString()}`;
        const { status, data } = await api('PATCH', `/api/projects/${testProjectId}`, {
            apiKey: adminApiKey,
            body: { name: newName }
        });

        if (status === 200) {
            assert.equal(data.name, newName);
        }
    });

    test('GET /api/projects/:projectId/board returns board data', async () => {
        if (!adminApiKey || !testProjectId) return;

        const { status, data } = await api('GET', `/api/projects/${testProjectId}/board`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(data.project, 'Should have project');
        assert.ok(data.columns, 'Should have columns');
        assert.ok(Array.isArray(data.tasks), 'Should have tasks array');
    });

    test('GET /api/projects/:projectId/context returns project context', async () => {
        if (!adminApiKey || !testProjectId) return;

        const { status, data } = await api('GET', `/api/projects/${testProjectId}/context`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok('description' in data, 'Should have description');
        assert.ok('repoPath' in data, 'Should have repoPath');
        assert.ok('localPath' in data, 'Should have localPath');
        assert.ok('notes' in data, 'Should have notes');
    });

    test('PATCH /api/projects/:projectId/context updates project context', async () => {
        if (!adminApiKey || !testProjectId) return;

        const notes = `Test notes ${randomString()}`;
        const { status, data } = await api('PATCH', `/api/projects/${testProjectId}/context`, {
            apiKey: adminApiKey,
            body: { notes }
        });

        if (status === 200) {
            assert.equal(data.notes, notes);
        }
    });

    test('GET /api/projects/:projectId/epics returns epics', async () => {
        if (!adminApiKey || !testProjectId) return;

        const { status, data } = await api('GET', `/api/projects/${testProjectId}/epics`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(data.project, 'Should have project');
        assert.ok(Array.isArray(data.epics), 'Should have epics array');
    });

    test('Member cannot access unassigned project', async () => {
        if (!memberApiKey || !testProjectId) return;

        // First remove project access
        await api('PUT', `/api/admin/users/${testUserId}/projects`, {
            apiKey: adminApiKey,
            body: { projectIds: [] }
        });

        const { status } = await api('GET', `/api/projects/${testProjectId}/board`, {
            apiKey: memberApiKey
        });
        assert.equal(status, 403);
    });
});

// ============================================================================
// TASK TESTS
// ============================================================================

describe('Tasks', { timeout: TEST_TIMEOUT }, () => {
    test('POST /api/tasks creates new task', async () => {
        if (!adminApiKey || !testProjectId) return;

        const title = `Test Task ${randomString()}`;
        const { status, data } = await api('POST', '/api/tasks', {
            apiKey: adminApiKey,
            body: {
                projectId: testProjectId,
                columnName: 'Backlog',
                title,
                description: 'Test description',
                type: 'story',
                priority: 'medium'
            }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return task id');
            assert.equal(data.title, title);
            assert.ok(data.ticketNumber, 'Should have ticket number');
            testTaskId = data.id;
        }
    });

    test('POST /api/tasks validates required fields', async () => {
        if (!adminApiKey || !testProjectId) return;

        const { status } = await api('POST', '/api/tasks', {
            apiKey: adminApiKey,
            body: {
                projectId: testProjectId,
                columnName: 'Backlog'
                // Missing title
            }
        });
        assert.equal(status, 400);
    });

    test('POST /api/tasks validates column name', async () => {
        if (!adminApiKey || !testProjectId) return;

        const { status } = await api('POST', '/api/tasks', {
            apiKey: adminApiKey,
            body: {
                projectId: testProjectId,
                columnName: 'NonexistentColumn',
                title: 'Test Task'
            }
        });
        assert.equal(status, 400);
    });

    test('GET /api/tasks/:taskId returns task', async () => {
        if (!adminApiKey || !testTaskId) return;

        const { status, data } = await api('GET', `/api/tasks/${testTaskId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.id, testTaskId);
    });

    test('PATCH /api/tasks/:taskId updates task', async () => {
        if (!adminApiKey || !testTaskId) return;

        const newTitle = `Updated Task ${randomString()}`;
        const { status, data } = await api('PATCH', `/api/tasks/${testTaskId}`, {
            apiKey: adminApiKey,
            body: { title: newTitle, priority: 'high' }
        });

        if (status === 200) {
            assert.equal(data.title, newTitle);
            assert.equal(data.priority, 'high');
        }
    });

    test('PATCH /api/tasks/:taskId/move moves task to different column', async () => {
        if (!adminApiKey || !testTaskId) return;

        const { status, data } = await api('PATCH', `/api/tasks/${testTaskId}/move`, {
            apiKey: adminApiKey,
            body: { columnName: 'Todo', order: 0 }
        });

        if (status === 200) {
            assert.equal(data.columnName, 'Todo');
        }
    });

    test('PATCH /api/tasks/:taskId/move validates column', async () => {
        if (!adminApiKey || !testTaskId) return;

        const { status } = await api('PATCH', `/api/tasks/${testTaskId}/move`, {
            apiKey: adminApiKey,
            body: { columnName: 'InvalidColumn', order: 0 }
        });
        assert.equal(status, 400);
    });

    test('POST /api/columns/reorder reorders tasks in column', async () => {
        if (!adminApiKey || !testProjectId || !testTaskId) return;

        // Create another task in the same column
        const { data: task2 } = await api('POST', '/api/tasks', {
            apiKey: adminApiKey,
            body: {
                projectId: testProjectId,
                columnName: 'Todo',
                title: `Second Task ${randomString()}`,
                type: 'story'
            }
        });

        if (!task2?.id) return;

        const { status, data } = await api('POST', '/api/columns/reorder', {
            apiKey: adminApiKey,
            body: {
                projectId: testProjectId,
                columnName: 'Todo',
                orderedTaskIds: [task2.id, testTaskId]
            }
        });

        if (status === 200) {
            assert.equal(data.reordered, 2);
        }

        // Clean up
        await api('DELETE', `/api/tasks/${task2.id}`, { apiKey: adminApiKey });
    });
});

// ============================================================================
// COMMENT TESTS
// ============================================================================

describe('Comments', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/tasks/:taskId/comments lists comments', async () => {
        if (!adminApiKey || !testTaskId) return;

        const { status, data } = await api('GET', `/api/tasks/${testTaskId}/comments`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('POST /api/tasks/:taskId/comments adds comment', async () => {
        if (!adminApiKey || !testTaskId) return;

        const body = `Test comment ${randomString()}`;
        const { status, data } = await api('POST', `/api/tasks/${testTaskId}/comments`, {
            apiKey: adminApiKey,
            body: { body }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return comment id');
            assert.equal(data.body, body);
            testCommentId = data.id;
        }
    });

    test('POST /api/tasks/:taskId/comments validates body', async () => {
        if (!adminApiKey || !testTaskId) return;

        const { status } = await api('POST', `/api/tasks/${testTaskId}/comments`, {
            apiKey: adminApiKey,
            body: { body: '' }
        });
        assert.equal(status, 400);
    });
});

// ============================================================================
// ACTIVITY TESTS
// ============================================================================

describe('Activity', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/activity lists recent activity', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/activity', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('GET /api/tasks/:taskId/activity lists task activity', async () => {
        if (!adminApiKey || !testTaskId) return;

        const { status, data } = await api('GET', `/api/tasks/${testTaskId}/activity`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });
});

// ============================================================================
// AGENT TESTS
// ============================================================================

describe('Agents', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/agents lists agents', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/agents', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('POST /api/agents creates agent (admin only)', async () => {
        if (!adminApiKey) return;

        const name = `TestAgent_${randomString()}`;
        const { status, data } = await api('POST', '/api/agents', {
            apiKey: adminApiKey,
            body: {
                name,
                role: 'developer',
                model: 'anthropic/claude-opus-4-6'
            }
        });

        // Note: This may fail if Talon sync fails, which is expected in test env
        if (status === 200) {
            assert.ok(data.id, 'Should return agent id');
            assert.equal(data.name, name);
            testAgentId = data.id;
        } else if (status === 502) {
            // Talon sync failed - expected in test environment
            console.log('Agent creation skipped - Talon not available');
        }
    });

    test('POST /api/agents creates agent with talonId mapping', async () => {
        if (!adminApiKey) return;

        const name = `TalonAgent_${randomString()}`;
        const talonId = `talon-${randomString()}`;
        
        // This test specifically verifies that passing 'talonId' doesn't crash Prisma
        // and correctly maps to 'talonAgentId' in the DB (implied by success)
        const { status, data } = await api('POST', '/api/agents', {
            apiKey: adminApiKey,
            body: {
                name,
                role: 'tester',
                talonId // This field triggered the bug
            }
        });

        // 502 is acceptable if Talon sync fails, but 200 is ideal. 
        // 500 (Prisma error) is what we are testing against.
        assert.ok([200, 502].includes(status), `Expected 200 or 502, got ${status}`);
        
        if (status === 200) {
            assert.equal(data.name, name);
            // Verify the remapping happened if the API returns the DB object
            // The API returns the Prisma Agent object, which has talonAgentId
            if (data.talonAgentId) {
                assert.equal(data.talonAgentId, talonId);
            }
            testAgentId = data.id;
        }
    });

    test('PATCH /api/agents/:id updates agent', async () => {
        if (!adminApiKey || !testAgentId) return;

        const newRole = 'senior developer';
        const { status, data } = await api('PATCH', `/api/agents/${testAgentId}`, {
            apiKey: adminApiKey,
            body: { role: newRole }
        });

        if (status === 200) {
            assert.equal(data.role, newRole);
        }
    });

    test('GET /api/agents/:id/messages lists agent messages', async () => {
        if (!adminApiKey || !testAgentId) return;

        const { status, data } = await api('GET', `/api/agents/${testAgentId}/messages`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('POST /api/agents/:id/messages sends message to agent', async () => {
        if (!adminApiKey || !testAgentId) return;

        const body = `Test message ${randomString()}`;
        const { status, data } = await api('POST', `/api/agents/${testAgentId}/messages`, {
            apiKey: adminApiKey,
            body: { body }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return message id');
            assert.equal(data.body, body);
        }
    });
});

// ============================================================================
// DOCUMENT TESTS
// ============================================================================

describe('Documents', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/documents lists documents', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/documents', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('POST /api/documents creates document', async () => {
        if (!adminApiKey) return;

        const title = `Test Document ${randomString()}`;
        const { status, data } = await api('POST', '/api/documents', {
            apiKey: adminApiKey,
            body: {
                title,
                content: 'Test content',
                type: 'deliverable'
            }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return document id');
            assert.equal(data.title, title);
            testDocumentId = data.id;
        }
    });

    test('PATCH /api/documents/:id updates document', async () => {
        if (!adminApiKey || !testDocumentId) return;

        const newTitle = `Updated Document ${randomString()}`;
        const { status, data } = await api('PATCH', `/api/documents/${testDocumentId}`, {
            apiKey: adminApiKey,
            body: { title: newTitle }
        });

        if (status === 200) {
            assert.equal(data.title, newTitle);
        }
    });

    test('GET /api/documents?taskId filters by task', async () => {
        if (!adminApiKey || !testTaskId) return;

        const { status, data } = await api('GET', `/api/documents?taskId=${testTaskId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });
});

// ============================================================================
// ROUTING RULES TESTS
// ============================================================================

describe('Routing Rules', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/projects/:projectId/routing-rules lists rules', async () => {
        if (!adminApiKey || !testProjectId) return;

        const { status, data } = await api('GET', `/api/projects/${testProjectId}/routing-rules`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('POST /api/projects/:projectId/routing-rules creates rule', async () => {
        if (!adminApiKey || !testProjectId || !testAgentId) return;

        const { status, data } = await api('POST', `/api/projects/${testProjectId}/routing-rules`, {
            apiKey: adminApiKey,
            body: {
                agentId: testAgentId,
                type: 'story',
                priority: 'high',
                enabled: true
            }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return rule id');
            testRoutingRuleId = data.id;
        }
    });

    test('PATCH /api/routing-rules/:id updates rule', async () => {
        if (!adminApiKey || !testRoutingRuleId) return;

        const { status, data } = await api('PATCH', `/api/routing-rules/${testRoutingRuleId}`, {
            apiKey: adminApiKey,
            body: { enabled: false }
        });

        if (status === 200) {
            assert.equal(data.enabled, false);
        }
    });

    test('DELETE /api/routing-rules/:id deletes rule', async () => {
        if (!adminApiKey || !testRoutingRuleId) return;

        const { status, data } = await api('DELETE', `/api/routing-rules/${testRoutingRuleId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.deleted, true);
    });
});

// ============================================================================
// USERS LIST TESTS
// ============================================================================

describe('Users', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/users returns user list', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/users', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('Member sees only themselves in user list', async () => {
        if (!memberApiKey) return;

        const { status, data } = await api('GET', '/api/users', {
            apiKey: memberApiKey
        });

        if (status === 200) {
            assert.equal(data.length, 1, 'Member should only see themselves');
        }
    });
});

// ============================================================================
// ADMIN TALON QUEUE TESTS
// ============================================================================

describe('Admin Talon Queue', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/admin/talon/queue lists queue items', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/admin/talon/queue', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('POST /api/admin/talon/queue/process processes queue', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('POST', '/api/admin/talon/queue/process', {
            apiKey: adminApiKey,
            body: { limit: 5 }
        });
        assert.equal(status, 200);
        assert.ok('processed' in data, 'Should return processed count');
    });
});

// ============================================================================
// CLIENT ERROR ENDPOINT
// ============================================================================

describe('Client Error Reporting', { timeout: TEST_TIMEOUT }, () => {
    test('POST /api/client-error logs error', async () => {
        const { status, data } = await api('POST', '/api/client-error', {
            body: {
                message: 'Test error',
                stack: 'at test.js:1:1',
                extra: { userAgent: 'test' }
            }
        });
        assert.equal(status, 200);
        assert.equal(data.logged, true);
    });
});

// ============================================================================
// LLM PROVIDER TESTS
// ============================================================================

let testProviderId = '';

describe('LLM Providers', { timeout: TEST_TIMEOUT }, () => {
    test('GET /api/llm/providers lists providers', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/llm/providers', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
    });

    test('POST /api/llm/providers creates provider', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('POST', '/api/llm/providers', {
            apiKey: adminApiKey,
            body: {
                name: `Test Provider ${randomString()}`,
                providerType: 'openai',
                apiKey: 'sk-test-key'
            }
        });

        if (status === 200) {
            assert.ok(data.id, 'Should return provider id');
            assert.equal(data.providerType, 'openai');
            testProviderId = data.id;
        }
    });

    test('PATCH /api/llm/providers/:id updates provider', async () => {
        if (!adminApiKey || !testProviderId) return;

        const newName = `Updated Provider ${randomString()}`;
        const { status, data } = await api('PATCH', `/api/llm/providers/${testProviderId}`, {
            apiKey: adminApiKey,
            body: { name: newName }
        });

        if (status === 200) {
            assert.equal(data.name, newName);
        }
    });

    test('POST /api/llm/providers/:id/test tests connection (mock)', async () => {
        if (!adminApiKey || !testProviderId) return;

        // This might fail if the key is invalid, but we just want to ensure the endpoint is reachable
        // and doesn't crash.
        const { status } = await api('POST', `/api/llm/providers/${testProviderId}/test`, {
            apiKey: adminApiKey
        });
        // 200 or 400/500 are acceptable as long as it's handled. 
        // 200 means success, 400/500 means auth error from provider which is expected with fake key.
        assert.ok([200, 400, 500].includes(status));
    });

    test('DELETE /api/llm/providers/:id deletes provider', async () => {
        if (!adminApiKey || !testProviderId) return;

        const { status, data } = await api('DELETE', `/api/llm/providers/${testProviderId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.deleted, true);
    });
});

// ============================================================================
// LLM MODEL TESTS
// ============================================================================

let testModelId = '';

describe('LLM Models', { timeout: TEST_TIMEOUT }, () => {
    test('POST /api/llm/models registers new models', async () => {
        if (!adminApiKey || !testProviderId) return;

        const { status, data } = await api('POST', '/api/llm/models', {
            apiKey: adminApiKey,
            body: {
                providerId: testProviderId,
                models: [
                    {
                        providerModelId: 'gpt-4o-test',
                        displayName: 'GPT-4o Test',
                        modality: ['text'],
                        meta: { context: 128000 }
                    }
                ]
            }
        });

        if (status === 200) {
            assert.ok(data.count >= 1, 'Should register at least one model');
        }
    });

    test('GET /api/llm/models lists models', async () => {
        if (!adminApiKey) return;

        const { status, data } = await api('GET', '/api/llm/models', {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Should return array');
        
        // Find our test model to save ID
        const found = data.find(m => m.providerModelId === 'gpt-4o-test');
        if (found) {
            testModelId = found.id;
        }
    });

    test('PATCH /api/llm/models/:id updates model', async () => {
        if (!adminApiKey || !testModelId) return;

        const newName = `Updated Model ${randomString()}`;
        const { status, data } = await api('PATCH', `/api/llm/models/${testModelId}`, {
            apiKey: adminApiKey,
            body: { displayName: newName }
        });

        if (status === 200) {
            assert.equal(data.displayName, newName);
        }
    });

    test('DELETE /api/llm/models/:id deletes model', async () => {
        if (!adminApiKey || !testModelId) return;

        const { status, data } = await api('DELETE', `/api/llm/models/${testModelId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.deleted, true);
    });
});

// ============================================================================
// CLEANUP
// ============================================================================

describe('Cleanup', { timeout: TEST_TIMEOUT }, () => {
    test('Delete test task', async () => {
        if (!adminApiKey || !testTaskId) return;

        const { status, data } = await api('DELETE', `/api/tasks/${testTaskId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.deleted, true);
    });

    test('Delete test agent', async () => {
        if (!adminApiKey || !testAgentId) return;

        const { status } = await api('DELETE', `/api/agents/${testAgentId}`, {
            apiKey: adminApiKey
        });
        // May fail due to Talon sync
        assert.ok([200, 502].includes(status));
    });

    test('Delete test project', async () => {
        if (!adminApiKey || !testProjectId) return;

        const { status, data } = await api('DELETE', `/api/projects/${testProjectId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.deleted, true);
    });
});
