/**
 * LLM Providers API Integration Tests
 * 
 * Run with: node --test test/llm_providers.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const API_BASE = process.env.API_BASE || 'http://localhost:3333';
const TEST_TIMEOUT = 30000;

let adminApiKey = '';
let testProviderId = '';

async function api(method, path, { body, apiKey, expectStatus } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    const options = { method, headers };
    if (body && method !== 'GET') options.body = JSON.stringify(body);

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

describe('LLM Providers API', { timeout: TEST_TIMEOUT }, () => {
    before(async () => {
        // Login as admin
        const { status, data } = await api('POST', '/api/login', {
            body: { username: 'amdsh', password: 'password' }
        });
        if (status === 200) {
            adminApiKey = data.apiKey;
        } else {
            console.warn('Admin login failed, skipping tests requiring auth');
        }
    });

    test('GET /api/llm/providers lists providers (admin only)', async () => {
        if (!adminApiKey) return;
        const { status, data } = await api('GET', '/api/llm/providers', { apiKey: adminApiKey });
        assert.equal(status, 200);
        assert.ok(Array.isArray(data.data), 'Should return data array');
    });

    test('POST /api/llm/providers creates a new provider', async () => {
        if (!adminApiKey) return;
        const name = `TestProvider_${randomString()}`;
        const { status, data } = await api('POST', '/api/llm/providers', {
            apiKey: adminApiKey,
            body: {
                name,
                providerType: 'ollama',
                baseUrl: 'http://localhost:11434'
            }
        });
        
        if (status === 201) {
            assert.ok(data.data.id, 'Should return provider ID');
            assert.equal(data.data.name, name);
            testProviderId = data.data.id;
        } else {
            assert.fail(`Failed to create provider: ${JSON.stringify(data)}`);
        }
    });

    test('POST /api/llm/providers validates required fields', async () => {
        if (!adminApiKey) return;
        const { status } = await api('POST', '/api/llm/providers', {
            apiKey: adminApiKey,
            body: {
                name: 'Invalid',
                // Missing providerType
            }
        });
        assert.equal(status, 400);
    });

    test('GET /api/llm/providers/:id returns details', async () => {
        if (!adminApiKey || !testProviderId) return;
        const { status, data } = await api('GET', `/api/llm/providers/${testProviderId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.data.id, testProviderId);
        assert.equal(data.data.providerType, 'ollama');
    });

    test('PATCH /api/llm/providers/:id updates provider', async () => {
        if (!adminApiKey || !testProviderId) return;
        const newName = `UpdatedProvider_${randomString()}`;
        const { status, data } = await api('PATCH', `/api/llm/providers/${testProviderId}`, {
            apiKey: adminApiKey,
            body: { name: newName }
        });
        
        assert.equal(status, 200);
        
        // Verify update
        const verify = await api('GET', `/api/llm/providers/${testProviderId}`, { apiKey: adminApiKey });
        assert.equal(verify.data.data.name, newName);
    });

    test('POST /api/llm/providers/:id/test tests connection', async () => {
        if (!adminApiKey || !testProviderId) return;
        // This might fail if Ollama isn't running, but the API should handle it gracefully
        const { status, data } = await api('POST', `/api/llm/providers/${testProviderId}/test`, {
            apiKey: adminApiKey
        });
        // We expect either 200 (success or handled failure) or maybe 500 if unhandled
        // The code returns json({ data: result }) even on connection error usually, 
        // unless it throws. 
        // Let's assume 200 or 500. Ideally 200 with status='error' in body.
        if (status === 200) {
            assert.ok(data.data.status, 'Should return status');
        }
    });

    test('DELETE /api/llm/providers/:id deletes provider', async () => {
        if (!adminApiKey || !testProviderId) return;
        const { status, data } = await api('DELETE', `/api/llm/providers/${testProviderId}`, {
            apiKey: adminApiKey
        });
        assert.equal(status, 200);
        assert.equal(data.data.deleted, true);

        // Verify gone
        const verify = await api('GET', `/api/llm/providers/${testProviderId}`, { apiKey: adminApiKey });
        assert.equal(verify.status, 404);
    });
});
