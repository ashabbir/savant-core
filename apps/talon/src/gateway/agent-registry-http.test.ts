import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAgentRegistryHttpRequest } from './agent-registry-http.js';
import { agentRegistry } from '../agents/registry.js';
import * as httpCommon from './http-common.js';
import * as auth from './auth.js';
import { IncomingMessage, ServerResponse } from 'node:http';

vi.mock('../agents/registry.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../agents/registry.js')>();
    return {
        ...actual,
        agentRegistry: {
            get: vi.fn(),
            list: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        }
    };
});
vi.mock('./http-common.js');
vi.mock('./auth.js');

describe('handleAgentRegistryHttpRequest', () => {
    let req: IncomingMessage;
    let res: ServerResponse;
    const mockAuth = {
        apiKeys: [],
        tailscale: { allowed: false, requireKey: false },
        basic: [],
        oidc: []
    } as any;

    beforeEach(() => {
        req = {
            url: '/v1/agents',
            method: 'GET',
            headers: {},
        } as any;
        res = {
            statusCode: 200,
            setHeader: vi.fn(),
            end: vi.fn(),
        } as any;
        vi.resetAllMocks();

        // Mock auth success by default
        vi.mocked(auth.authorizeGatewayConnect).mockResolvedValue({ ok: true, user: { id: 'test' } } as any);
    });

    it('should return false for non-matching path', async () => {
        req.url = '/v1/other';
        const result = await handleAgentRegistryHttpRequest(req, res, { auth: mockAuth });
        expect(result).toBe(false);
    });

    it('should list agents', async () => {
        vi.mocked(agentRegistry.list).mockReturnValue([{ id: 'test', name: 'Test' }] as any);
        const result = await handleAgentRegistryHttpRequest(req, res, { auth: mockAuth });
        expect(result).toBe(true);
        expect(httpCommon.sendJson).toHaveBeenCalledWith(res, 200, { data: [{ id: 'test', name: 'Test' }] });
    });

    it('should get specific agent', async () => {
        req.url = '/v1/agents/test';
        vi.mocked(agentRegistry.get).mockReturnValue({ id: 'test', name: 'Test' } as any);
        const result = await handleAgentRegistryHttpRequest(req, res, { auth: mockAuth });
        expect(result).toBe(true);
        expect(httpCommon.sendJson).toHaveBeenCalledWith(res, 200, { id: 'test', name: 'Test' });
    });

    it('should create agent via POST', async () => {
        req.method = 'POST';
        const agentData = { id: 'new', name: 'New', role: 'test', model: 'gpt-4' };
        vi.mocked(httpCommon.readJsonBodyOrError).mockResolvedValue(agentData);
        // Mock safeParse via direct call since zod is not easily mocked this way, assuming implementation calls it.
        // Or integration style. But here unit test assumes implementation structure.
        // Actually, handleAgentRegistryHttpRequest calls AgentConfigSchema.safeParse(body).
        // Since I can't mock zod export easily without module mock, I'll rely on it working correctly with valid data.

        const result = await handleAgentRegistryHttpRequest(req, res, { auth: mockAuth });
        expect(result).toBe(true);
        expect(agentRegistry.create).toHaveBeenCalledWith(agentData);
        expect(httpCommon.sendJson).toHaveBeenCalledWith(res, 201, agentData);
    });
});
