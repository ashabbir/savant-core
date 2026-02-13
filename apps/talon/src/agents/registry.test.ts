import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRegistryService, type AgentConfig } from './registry.js';

vi.mock('node:fs');

describe('AgentRegistryService', () => {
    let registry: AgentRegistryService;
    const mockDataFile = path.resolve(process.cwd(), 'data/agents.json');
    const mockAgent: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        role: 'tester',
        model: 'gpt-4',
        systemPrompt: 'You are a test agent.',
        temperature: 0.7,
        description: 'Just for testing'
    };

    beforeEach(() => {
        vi.resetAllMocks();
        // Default mock for existsSync to false so load() starts empty
        vi.mocked(fs.existsSync).mockReturnValue(false);
        // Re-instantiate to test clean state
        registry = new AgentRegistryService();
    });

    it('should create an agent', () => {
        registry.create(mockAgent);
        expect(registry.get('test-agent')).toEqual(mockAgent);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            mockDataFile,
            expect.stringContaining('"id": "test-agent"'),
            'utf-8'
        );
    });

    it('should get an agent', () => {
        registry.create(mockAgent);
        const agent = registry.get('test-agent');
        expect(agent).toEqual(mockAgent);
    });

    it('should update an agent', () => {
        registry.create(mockAgent);
        const updated = registry.update('test-agent', { temperature: 0.9 });
        expect(updated).toEqual({ ...mockAgent, temperature: 0.9 });
        expect(registry.get('test-agent')?.temperature).toBe(0.9);
    });

    it('should delete an agent', () => {
        registry.create(mockAgent);
        const result = registry.delete('test-agent');
        expect(result).toBe(true);
        expect(registry.get('test-agent')).toBeUndefined();
    });

    it('should list all agents', () => {
        registry.create(mockAgent);
        registry.create({ ...mockAgent, id: 'test-agent-2' });
        const list = registry.list();
        expect(list).toHaveLength(2);
    });

    it('should load agents from file on instantiation', () => {
        const fileContent = JSON.stringify([mockAgent]);
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(fileContent);

        const newRegistry = new AgentRegistryService();
        expect(newRegistry.get('test-agent')).toEqual(mockAgent);
    });
});
