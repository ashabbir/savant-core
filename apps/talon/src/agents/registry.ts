import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

export const AgentConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    model: z.union([
        z.string(),
        z.object({
            primary: z.string().optional(),
            fallbacks: z.array(z.string()).optional()
        })
    ]),
    systemPrompt: z.string().optional(),
    skills: z.array(z.string()).optional(),
    temperature: z.number().optional(),
    description: z.string().optional(),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    guardrails: z.string().optional(),
    bootstrap: z.string().optional(),
    repoContext: z.string().optional(),
    tools: z
        .object({
            disableTools: z.boolean().optional(),
        })
        .optional(),
    type: z.enum(['main', 'subagent']).optional(),
    parentAgentId: z.string().nullable().optional(),
    isSystem: z.boolean().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

import { fileURLToPath } from 'node:url';

function resolveDataFile(): string {
    try {
        let cursor = path.dirname(fileURLToPath(import.meta.url));
        // Search up to 5 levels up for the data directory
        for (let i = 0; i < 5; i++) {
            const candidate = path.resolve(cursor, 'data/agents.json');
            if (fs.existsSync(candidate)) {
                return candidate;
            }
            const parent = path.dirname(cursor);
            if (parent === cursor) break;
            cursor = parent;
        }
    } catch {
        // ignore
    }
    // Fallback to current behavior if not found
    return path.resolve(process.cwd(), 'apps/talon/data/agents.json');
}

const DATA_FILE = resolveDataFile();
const JARVIS_ID = 'jarvis';
const JARVIS_NAME = 'Jarvis';
const JARVIS_DEFAULT_MODEL = 'ollama/llama3.1';

function normalizeLower(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function buildJarvisConfig(seed?: Partial<AgentConfig>): AgentConfig {
    return {
        id: JARVIS_ID,
        name: JARVIS_NAME,
        role: seed?.role || 'Main Assistant',
        model: seed?.model || JARVIS_DEFAULT_MODEL,
        systemPrompt: seed?.systemPrompt || 'You are Jarvis, the primary system assistant.',
        guardrails: seed?.guardrails || '',
        bootstrap: seed?.bootstrap || '',
        repoContext: seed?.repoContext || '',
        tools: seed?.tools,
        type: 'main',
        parentAgentId: null,
        isSystem: true
    };
}

export class AgentRegistryService {
    private agents: Map<string, AgentConfig> = new Map();

    constructor() {
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                const content = fs.readFileSync(DATA_FILE, 'utf-8');
                const data = JSON.parse(content);
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        const result = AgentConfigSchema.safeParse(item);
                        if (result.success) {
                            this.agents.set(result.data.id, result.data);
                        }
                    });
                }
            }
            this.normalizeHierarchy();
        } catch (error) {
            console.error('Failed to load agent registry:', error);
        }
    }

    private normalizeHierarchy() {
        const current = Array.from(this.agents.values());
        let changed = false;

        let jarvis = this.agents.get(JARVIS_ID);
        if (!jarvis) {
            const byName = current.find((agent) => normalizeLower(agent.name) === JARVIS_ID);
            if (byName) {
                jarvis = buildJarvisConfig(byName);
            } else {
                jarvis = buildJarvisConfig();
            }
            this.agents.set(JARVIS_ID, jarvis);
            changed = true;
        }

        const normalizedJarvis = buildJarvisConfig(jarvis);
        if (JSON.stringify(jarvis) !== JSON.stringify(normalizedJarvis)) {
            this.agents.set(JARVIS_ID, normalizedJarvis);
            changed = true;
        }

        for (const [id, agent] of this.agents.entries()) {
            if (id === JARVIS_ID) continue;
            const normalized: AgentConfig = {
                ...agent,
                type: 'subagent',
                parentAgentId: JARVIS_ID,
                isSystem: false
            };
            if (normalizeLower(normalized.name) === JARVIS_ID) {
                normalized.name = `${agent.name}-${id}`;
            }
            if (JSON.stringify(agent) !== JSON.stringify(normalized)) {
                this.agents.set(id, normalized);
                changed = true;
            }
        }

        if (changed) this.save();
    }

    private save() {
        try {
            const dir = path.dirname(DATA_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const data = Array.from(this.agents.values());
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save agent registry:', error);
        }
    }

    create(config: AgentConfig): AgentConfig {
        const normalized: AgentConfig = config.id === JARVIS_ID
            ? buildJarvisConfig(config)
            : {
                ...config,
                type: 'subagent' as const,
                parentAgentId: JARVIS_ID,
                isSystem: false
            };
        this.agents.set(normalized.id, normalized);
        this.normalizeHierarchy();
        this.save();
        return normalized;
    }

    update(id: string, updates: Partial<AgentConfig>): AgentConfig | undefined {
        const existing = this.agents.get(id);
        if (!existing) return undefined;

        const updated = { ...existing, ...updates, id }; // Ensure ID doesn't change
        const normalized: AgentConfig = id === JARVIS_ID
            ? buildJarvisConfig(updated)
            : {
                ...updated,
                type: 'subagent' as const,
                parentAgentId: JARVIS_ID,
                isSystem: false
            };
        this.agents.set(id, normalized);
        this.normalizeHierarchy();
        this.save();
        return normalized;
    }

    get(id: string): AgentConfig | undefined {
        return this.agents.get(id);
    }

    list(): AgentConfig[] {
        return Array.from(this.agents.values());
    }

    delete(id: string): boolean {
        if (id === JARVIS_ID) {
            return false;
        }
        const deleted = this.agents.delete(id);
        if (deleted) {
            this.normalizeHierarchy();
            this.save();
        }
        return deleted;
    }
}

export const agentRegistry = new AgentRegistryService();
