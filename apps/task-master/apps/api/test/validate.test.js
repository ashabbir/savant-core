/**
 * Validation Schema Tests
 * 
 * Tests for all Zod validation schemas in validate.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    CreateProject,
    UpdateProject,
    UpdateProjectContext,
    CreateTask,
    UpdateTask,
    CreateComment,
    Login,
    ChangePassword,
    AdminCreateUser,
    AdminUpdateUser,
    CreateRoutingRule,
    UpdateRoutingRule,
    CreateNotificationSubscription,
    UpdateNotificationSubscription,
    AdminSetUserPassword,
    AdminAssignUserProjects,
    UpdateMe,
    CreateAgent,
    UpdateAgent,
    CreateDocument,
    UpdateDocument,
    CreateAgentMessage,
    MoveTask,
    ReorderColumn
} from '../src/validate.js';

// ============================================================================
// CREATE PROJECT SCHEMA
// ============================================================================

describe('CreateProject schema', () => {
    test('accepts valid project', () => {
        const result = CreateProject.safeParse({
            name: 'Test Project',
            code: 'TP'
        });
        assert.ok(result.success);
    });

    test('accepts project with optional fields', () => {
        const result = CreateProject.safeParse({
            name: 'Test Project',
            code: 'TP',
            enabledColumns: ['Backlog', 'Todo', 'Done'],
            color: '#FF5733'
        });
        assert.ok(result.success);
    });

    test('rejects empty name', () => {
        const result = CreateProject.safeParse({
            name: '',
            code: 'TP'
        });
        assert.ok(!result.success);
    });

    test('rejects name over 200 chars', () => {
        const result = CreateProject.safeParse({
            name: 'x'.repeat(201),
            code: 'TP'
        });
        assert.ok(!result.success);
    });

    test('rejects code over 10 chars', () => {
        const result = CreateProject.safeParse({
            name: 'Test',
            code: 'TOOLONGCODE'
        });
        assert.ok(!result.success);
    });

    test('rejects missing code', () => {
        const result = CreateProject.safeParse({
            name: 'Test Project'
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// UPDATE PROJECT SCHEMA
// ============================================================================

describe('UpdateProject schema', () => {
    test('accepts partial update', () => {
        const result = UpdateProject.safeParse({
            name: 'Updated Name'
        });
        assert.ok(result.success);
    });

    test('accepts empty object', () => {
        const result = UpdateProject.safeParse({});
        assert.ok(result.success);
    });

    test('accepts columns update', () => {
        const result = UpdateProject.safeParse({
            enabledColumns: ['Backlog', 'Todo', 'Done']
        });
        assert.ok(result.success);
    });
});

// ============================================================================
// UPDATE PROJECT CONTEXT SCHEMA
// ============================================================================

describe('UpdateProjectContext schema', () => {
    test('accepts all context fields', () => {
        const result = UpdateProjectContext.safeParse({
            description: 'Project description',
            repoPath: 'https://github.com/org/repo',
            localPath: '/home/user/project',
            notes: 'Some notes'
        });
        assert.ok(result.success);
    });

    test('rejects description over 5000 chars', () => {
        const result = UpdateProjectContext.safeParse({
            description: 'x'.repeat(5001)
        });
        assert.ok(!result.success);
    });

    test('rejects notes over 20000 chars', () => {
        const result = UpdateProjectContext.safeParse({
            notes: 'x'.repeat(20001)
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// CREATE TASK SCHEMA
// ============================================================================

describe('CreateTask schema', () => {
    test('accepts valid task with required fields', () => {
        const result = CreateTask.safeParse({
            projectId: '507f1f77bcf86cd799439011',
            columnName: 'Backlog',
            title: 'Test Task'
        });
        assert.ok(result.success);
    });

    test('accepts task with all optional fields', () => {
        const result = CreateTask.safeParse({
            projectId: '507f1f77bcf86cd799439011',
            columnName: 'Backlog',
            title: 'Test Task',
            description: 'Description',
            tags: 'tag1,tag2',
            dueAt: '2025-12-31T23:59:59.000Z',
            assignee: 'john',
            createdBy: 'admin',
            priority: 'high',
            type: 'story',
            epicId: '507f1f77bcf86cd799439012',
            epicColor: '#FF0000'
        });
        assert.ok(result.success);
    });

    test('rejects empty title', () => {
        const result = CreateTask.safeParse({
            projectId: '507f1f77bcf86cd799439011',
            columnName: 'Backlog',
            title: ''
        });
        assert.ok(!result.success);
    });

    test('rejects title over 300 chars', () => {
        const result = CreateTask.safeParse({
            projectId: '507f1f77bcf86cd799439011',
            columnName: 'Backlog',
            title: 'x'.repeat(301)
        });
        assert.ok(!result.success);
    });

    test('rejects invalid dueAt format', () => {
        const result = CreateTask.safeParse({
            projectId: '507f1f77bcf86cd799439011',
            columnName: 'Backlog',
            title: 'Task',
            dueAt: 'not-a-date'
        });
        assert.ok(!result.success);
    });

    test('accepts null epicId', () => {
        const result = CreateTask.safeParse({
            projectId: '507f1f77bcf86cd799439011',
            columnName: 'Backlog',
            title: 'Task',
            epicId: null
        });
        assert.ok(result.success);
    });
});

// ============================================================================
// UPDATE TASK SCHEMA
// ============================================================================

describe('UpdateTask schema', () => {
    test('accepts partial update', () => {
        const result = UpdateTask.safeParse({
            title: 'Updated Title'
        });
        assert.ok(result.success);
    });

    test('accepts nullable dueAt', () => {
        const result = UpdateTask.safeParse({
            dueAt: null
        });
        assert.ok(result.success);
    });

    test('accepts nullable epicId', () => {
        const result = UpdateTask.safeParse({
            epicId: null
        });
        assert.ok(result.success);
    });
});

// ============================================================================
// CREATE COMMENT SCHEMA
// ============================================================================

describe('CreateComment schema', () => {
    test('accepts valid comment', () => {
        const result = CreateComment.safeParse({
            body: 'This is a comment'
        });
        assert.ok(result.success);
    });

    test('accepts comment with author', () => {
        const result = CreateComment.safeParse({
            author: 'john',
            body: 'This is a comment'
        });
        assert.ok(result.success);
    });

    test('rejects empty body', () => {
        const result = CreateComment.safeParse({
            body: ''
        });
        assert.ok(!result.success);
    });

    test('rejects body over 5000 chars', () => {
        const result = CreateComment.safeParse({
            body: 'x'.repeat(5001)
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// LOGIN SCHEMA
// ============================================================================

describe('Login schema', () => {
    test('accepts valid credentials', () => {
        const result = Login.safeParse({
            username: 'admin',
            password: 'password123'
        });
        assert.ok(result.success);
    });

    test('rejects empty username', () => {
        const result = Login.safeParse({
            username: '',
            password: 'password123'
        });
        assert.ok(!result.success);
    });

    test('rejects empty password', () => {
        const result = Login.safeParse({
            username: 'admin',
            password: ''
        });
        assert.ok(!result.success);
    });

    test('rejects username over 50 chars', () => {
        const result = Login.safeParse({
            username: 'x'.repeat(51),
            password: 'password123'
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// CHANGE PASSWORD SCHEMA
// ============================================================================

describe('ChangePassword schema', () => {
    test('accepts valid password change', () => {
        const result = ChangePassword.safeParse({
            currentPassword: 'oldpass',
            newPassword: 'newpass123'
        });
        assert.ok(result.success);
    });

    test('rejects new password under 6 chars', () => {
        const result = ChangePassword.safeParse({
            currentPassword: 'oldpass',
            newPassword: '12345'
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// ADMIN CREATE USER SCHEMA
// ============================================================================

describe('AdminCreateUser schema', () => {
    test('accepts valid user', () => {
        const result = AdminCreateUser.safeParse({
            username: 'newuser',
            displayName: 'New User',
            password: 'password123'
        });
        assert.ok(result.success);
    });

    test('accepts user with role', () => {
        const result = AdminCreateUser.safeParse({
            username: 'newuser',
            displayName: 'New User',
            role: 'ADMIN',
            password: 'password123'
        });
        assert.ok(result.success);
        assert.equal(result.data.role, 'ADMIN');
    });

    test('defaults role to MEMBER', () => {
        const result = AdminCreateUser.safeParse({
            username: 'newuser',
            displayName: 'New User',
            password: 'password123'
        });
        assert.ok(result.success);
        assert.equal(result.data.role, 'MEMBER');
    });

    test('rejects invalid role', () => {
        const result = AdminCreateUser.safeParse({
            username: 'newuser',
            displayName: 'New User',
            role: 'SUPERADMIN',
            password: 'password123'
        });
        assert.ok(!result.success);
    });

    test('rejects short password', () => {
        const result = AdminCreateUser.safeParse({
            username: 'newuser',
            displayName: 'New User',
            password: '12345'
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// ADMIN UPDATE USER SCHEMA
// ============================================================================

describe('AdminUpdateUser schema', () => {
    test('accepts partial update', () => {
        const result = AdminUpdateUser.safeParse({
            displayName: 'Updated Name'
        });
        assert.ok(result.success);
    });

    test('accepts email update', () => {
        const result = AdminUpdateUser.safeParse({
            email: 'user@example.com'
        });
        assert.ok(result.success);
    });

    test('rejects invalid email', () => {
        const result = AdminUpdateUser.safeParse({
            email: 'not-an-email'
        });
        assert.ok(!result.success);
    });

    test('accepts active boolean', () => {
        const result = AdminUpdateUser.safeParse({
            active: false
        });
        assert.ok(result.success);
    });

    test('accepts quota limits', () => {
        const result = AdminUpdateUser.safeParse({
            monthlyTokenLimit: 1000000,
            monthlyCostLimit: 50.00
        });
        assert.ok(result.success);
    });

    test('rejects negative quota limits', () => {
        const result = AdminUpdateUser.safeParse({
            monthlyTokenLimit: -100
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// CREATE ROUTING RULE SCHEMA
// ============================================================================

describe('CreateRoutingRule schema', () => {
    test('accepts valid routing rule', () => {
        const result = CreateRoutingRule.safeParse({
            agentId: '507f1f77bcf86cd799439011'
        });
        assert.ok(result.success);
    });

    test('accepts rule with all fields', () => {
        const result = CreateRoutingRule.safeParse({
            agentId: '507f1f77bcf86cd799439011',
            type: 'story',
            priority: 'high',
            assignee: 'john',
            order: 0,
            enabled: true
        });
        assert.ok(result.success);
    });

    test('rejects empty agentId', () => {
        const result = CreateRoutingRule.safeParse({
            agentId: ''
        });
        assert.ok(!result.success);
    });

    test('rejects negative order', () => {
        const result = CreateRoutingRule.safeParse({
            agentId: '507f1f77bcf86cd799439011',
            order: -1
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// CREATE NOTIFICATION SUBSCRIPTION SCHEMA
// ============================================================================

describe('CreateNotificationSubscription schema', () => {
    test('accepts slack subscription', () => {
        const result = CreateNotificationSubscription.safeParse({
            channel: 'slack',
            target: 'https://hooks.slack.com/services/XXX/YYY/ZZZ'
        });
        assert.ok(result.success);
    });

    test('accepts email subscription', () => {
        const result = CreateNotificationSubscription.safeParse({
            channel: 'email',
            target: 'user@example.com'
        });
        assert.ok(result.success);
    });

    test('rejects invalid channel', () => {
        const result = CreateNotificationSubscription.safeParse({
            channel: 'sms',
            target: '+1234567890'
        });
        assert.ok(!result.success);
    });

    test('rejects empty target', () => {
        const result = CreateNotificationSubscription.safeParse({
            channel: 'slack',
            target: ''
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// UPDATE ME SCHEMA
// ============================================================================

describe('UpdateMe schema', () => {
    test('accepts displayName update', () => {
        const result = UpdateMe.safeParse({
            displayName: 'New Display Name'
        });
        assert.ok(result.success);
    });

    test('accepts email update', () => {
        const result = UpdateMe.safeParse({
            email: 'newemail@example.com'
        });
        assert.ok(result.success);
    });

    test('accepts null preferredAgentId', () => {
        const result = UpdateMe.safeParse({
            preferredAgentId: null
        });
        assert.ok(result.success);
    });

    test('rejects invalid email', () => {
        const result = UpdateMe.safeParse({
            email: 'invalid'
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// CREATE AGENT SCHEMA
// ============================================================================

describe('CreateAgent schema', () => {
    test('accepts valid agent', () => {
        const result = CreateAgent.safeParse({
            name: 'TestAgent'
        });
        assert.ok(result.success);
    });

    test('accepts agent with all fields', () => {
        const result = CreateAgent.safeParse({
            name: 'TestAgent',
            role: 'developer',
            model: 'anthropic/claude-opus-4-6',
            talonId: 'talon-agent-id',
            soul: 'You are a helpful assistant',
            guardrails: 'Never reveal secrets',
            status: 'idle'
        });
        assert.ok(result.success);
    });

    test('rejects empty name', () => {
        const result = CreateAgent.safeParse({
            name: ''
        });
        assert.ok(!result.success);
    });

    test('rejects name over 120 chars', () => {
        const result = CreateAgent.safeParse({
            name: 'x'.repeat(121)
        });
        assert.ok(!result.success);
    });

    test('rejects invalid status', () => {
        const result = CreateAgent.safeParse({
            name: 'TestAgent',
            status: 'sleeping'
        });
        assert.ok(!result.success);
    });

    test('accepts valid status values', () => {
        for (const status of ['idle', 'active', 'blocked']) {
            const result = CreateAgent.safeParse({
                name: 'TestAgent',
                status
            });
            assert.ok(result.success, `Should accept status: ${status}`);
        }
    });
});

// ============================================================================
// CREATE DOCUMENT SCHEMA
// ============================================================================

describe('CreateDocument schema', () => {
    test('accepts valid document', () => {
        const result = CreateDocument.safeParse({
            title: 'Test Document'
        });
        assert.ok(result.success);
    });

    test('accepts document with all fields', () => {
        const result = CreateDocument.safeParse({
            title: 'Test Document',
            content: '# Heading\n\nContent here',
            type: 'deliverable',
            taskId: '507f1f77bcf86cd799439011',
            createdBy: 'admin'
        });
        assert.ok(result.success);
    });

    test('accepts null taskId', () => {
        const result = CreateDocument.safeParse({
            title: 'Test Document',
            taskId: null
        });
        assert.ok(result.success);
    });

    test('rejects empty title', () => {
        const result = CreateDocument.safeParse({
            title: ''
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// CREATE AGENT MESSAGE SCHEMA
// ============================================================================

describe('CreateAgentMessage schema', () => {
    test('accepts valid message', () => {
        const result = CreateAgentMessage.safeParse({
            body: 'Hello agent!'
        });
        assert.ok(result.success);
    });

    test('accepts message with author', () => {
        const result = CreateAgentMessage.safeParse({
            author: 'system',
            body: 'Status update'
        });
        assert.ok(result.success);
    });

    test('rejects empty body', () => {
        const result = CreateAgentMessage.safeParse({
            body: ''
        });
        assert.ok(!result.success);
    });

    test('rejects body over 5000 chars', () => {
        const result = CreateAgentMessage.safeParse({
            body: 'x'.repeat(5001)
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// MOVE TASK SCHEMA
// ============================================================================

describe('MoveTask schema', () => {
    test('accepts valid move', () => {
        const result = MoveTask.safeParse({
            columnName: 'Todo',
            order: 0
        });
        assert.ok(result.success);
    });

    test('rejects empty column name', () => {
        const result = MoveTask.safeParse({
            columnName: '',
            order: 0
        });
        assert.ok(!result.success);
    });

    test('rejects negative order', () => {
        const result = MoveTask.safeParse({
            columnName: 'Todo',
            order: -1
        });
        assert.ok(!result.success);
    });

    test('rejects missing order', () => {
        const result = MoveTask.safeParse({
            columnName: 'Todo'
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// REORDER COLUMN SCHEMA
// ============================================================================

describe('ReorderColumn schema', () => {
    test('accepts valid reorder', () => {
        const result = ReorderColumn.safeParse({
            projectId: '507f1f77bcf86cd799439011',
            columnName: 'Backlog',
            orderedTaskIds: ['task1', 'task2', 'task3']
        });
        assert.ok(result.success);
    });

    test('rejects empty orderedTaskIds', () => {
        const result = ReorderColumn.safeParse({
            projectId: '507f1f77bcf86cd799439011',
            columnName: 'Backlog',
            orderedTaskIds: []
        });
        assert.ok(!result.success);
    });

    test('rejects empty projectId', () => {
        const result = ReorderColumn.safeParse({
            projectId: '',
            columnName: 'Backlog',
            orderedTaskIds: ['task1']
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// ADMIN SET USER PASSWORD SCHEMA
// ============================================================================

describe('AdminSetUserPassword schema', () => {
    test('accepts valid password', () => {
        const result = AdminSetUserPassword.safeParse({
            password: 'newpassword123'
        });
        assert.ok(result.success);
    });

    test('rejects password under 6 chars', () => {
        const result = AdminSetUserPassword.safeParse({
            password: '12345'
        });
        assert.ok(!result.success);
    });
});

// ============================================================================
// ADMIN ASSIGN USER PROJECTS SCHEMA
// ============================================================================

describe('AdminAssignUserProjects schema', () => {
    test('accepts valid project ids', () => {
        const result = AdminAssignUserProjects.safeParse({
            projectIds: ['proj1', 'proj2']
        });
        assert.ok(result.success);
    });

    test('defaults to empty array', () => {
        const result = AdminAssignUserProjects.safeParse({});
        assert.ok(result.success);
        assert.deepEqual(result.data.projectIds, []);
    });

    test('rejects empty string in projectIds', () => {
        const result = AdminAssignUserProjects.safeParse({
            projectIds: ['proj1', '']
        });
        assert.ok(!result.success);
    });
});
