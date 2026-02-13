# Task Master API Tests

This directory contains the test suite for the Task Master API.

## Test Files

| File | Description |
|------|-------------|
| `validate.test.js` | Unit tests for Zod validation schemas |
| `talon.test.js` | Unit tests for Talon integration helpers |
| `routingRules.test.js` | Unit tests for agent routing rule resolution |
| `taskMoves.test.js` | Unit tests for epic/task movement logic |
| `api.test.js` | Integration tests for all API endpoints |

## Running Tests

### Prerequisites

- Node.js ≥22
- MongoDB running (for integration tests)
- API server running (for integration tests)

### Unit Tests (No Database Required)

Run all unit tests locally without any external dependencies:

```bash
# From apps/task-master/apps/api directory
npm run test:unit

# Or from repo root
cd apps/task-master/apps/api && npm run test:unit
```

### Integration Tests (Requires Running API)

Integration tests require:
1. MongoDB running
2. Database seeded with test data (admin user)
3. API server running on port 3333

```bash
# Start the API first (in one terminal)
npm run dev

# Run integration tests (in another terminal)
npm run test:integration
```

### All Tests

Run both unit and integration tests:

```bash
npm run test:all
# or simply
npm test
```

### Watch Mode

Run tests in watch mode during development:

```bash
npm run test:watch
```

## Docker Commands

### Unit Tests via Docker

Run unit tests in a Docker container (only needs MongoDB):

```bash
# From repo root
docker compose --profile test up task-master-test
```

### Integration Tests via Docker

Run integration tests against the running API:

```bash
# First, ensure the API is running
docker compose up -d task-master-api

# Then run integration tests
docker compose --profile test-integration up task-master-test-integration
```

### Full Test Suite via Docker

```bash
# Run unit tests only (quick, no API needed)
docker compose --profile test run --rm task-master-test

# Run integration tests (requires API)
docker compose up -d mongo mongo-init task-master-api
docker compose --profile test-integration run --rm task-master-test-integration
```

## Test Coverage

### Unit Tests (117 tests)

- **Validation Schemas** (20 test suites)
  - CreateProject, UpdateProject, UpdateProjectContext
  - CreateTask, UpdateTask, MoveTask
  - CreateComment, CreateAgentMessage
  - Login, ChangePassword
  - AdminCreateUser, AdminUpdateUser, AdminSetUserPassword
  - CreateRoutingRule, UpdateRoutingRule
  - CreateNotificationSubscription, UpdateNotificationSubscription
  - UpdateMe, CreateAgent, CreateDocument
  - ReorderColumn, AdminAssignUserProjects

- **Talon Integration** (34 tests)
  - Session key building
  - Agent ID resolution
  - Trigger conditions
  - Response parsing
  - Request building

- **Routing Rules** (2 tests)
  - Rule matching by type/priority/assignee
  - Empty result handling

- **Task Moves** (3 tests)
  - Epic done→review redirection
  - Non-epic movement
  - Missing review column handling

### Integration Tests (60+ tests)

- **Health Check**: `/health` endpoint
- **Authentication**: Login, API key validation
- **User Profile**: GET/PATCH `/api/me`, password change, API key rotation
- **Notifications**: CRUD for notification subscriptions
- **Admin Users**: User creation, updates, password reset, project assignment
- **Projects**: CRUD, board view, context, epics
- **Tasks**: CRUD, move, reorder
- **Comments**: List, create
- **Activity**: Global and per-task activity
- **Agents**: CRUD, messages
- **Documents**: CRUD
- **Routing Rules**: CRUD
- **Talon Queue**: Admin queue management
- **Client Error**: Error logging endpoint

## Writing New Tests

Tests use Node.js built-in test runner (`node:test`). Example:

```javascript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('MyFeature', () => {
  test('should do something', () => {
    assert.equal(1 + 1, 2);
  });

  test('should handle errors', async () => {
    await assert.rejects(
      async () => { throw new Error('fail'); },
      /fail/
    );
  });
});
```

## Environment Variables

For integration tests:

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE` | Base URL for API | `http://localhost:3333` |
| `DATABASE_URL` | MongoDB connection string | Required |

## Troubleshooting

### "Admin user not found" in integration tests

The integration tests expect an admin user with credentials:
- Username: `admin`
- Password: `admin123`

Run the database seed to create this user:
```bash
npm run db:seed
```

### Connection refused

Ensure MongoDB is running and the API server is started before running integration tests.

### Tests timing out

Increase the timeout by modifying the test configuration:
```javascript
describe('MyTests', { timeout: 60000 }, () => {
  // ...
});
```
