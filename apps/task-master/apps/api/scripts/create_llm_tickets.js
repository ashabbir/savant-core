
const API_BASE = 'http://localhost:3333';
const API_KEY = '92b4040871e022ab8d96c07438363d10758c9cb19f3d26fc';
const PROJECT_ID = '69841b79fc994d7e2152ff8a';
const ASSIGNEE = 'amdsh';

async function api(method, path, body) {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || JSON.stringify(data));
        return data.data || data; // Handle cases where data wrapper might be missing or different
    } catch (err) {
        console.error(`API Error ${method} ${path}:`, err.message);
        throw err;
    }
}

async function main() {
    console.log('Creating LLM Model Registry Epic and Stories...');

    // Create Epic
    const epic = await api('POST', '/api/tasks', {
        projectId: PROJECT_ID,
        columnName: 'Backlog',
        title: 'LLM Model Registry',
        description: 'Implement a first-class LLM Model Registry in Task Master. See PRD: docs/prds/llm-model-registry.md',
        type: 'epic',
        priority: 'high',
        assignee: ASSIGNEE,
        createdBy: ASSIGNEE
    });
    console.log('✅ Epic Created:', epic.title, '(ID:', epic.id, ')');

    // Stories array
    const stories = [
        { title: 'Add LlmProvider and LlmModel Prisma schemas', priority: 'high', type: 'story', desc: 'Add new Prisma models for provider and model registry. Update Agent model with optional modelId.' },
        { title: 'Implement credential encryption vault (AES-256-GCM)', priority: 'high', type: 'story', desc: 'Create vault.js with encrypt/decrypt functions using aes-256-gcm cipher.' },
        { title: 'Implement Provider CRUD API endpoints', priority: 'high', type: 'story', desc: 'GET/POST/PATCH/DELETE for /api/llm/providers' },
        { title: 'Implement Provider Test Connection endpoint', priority: 'medium', type: 'story', desc: 'POST /api/llm/providers/:id/test - verify credentials' },
        { title: 'Create base adapter interface for LLM providers', priority: 'high', type: 'story', desc: 'Base class with testConnection() and discoverModels() methods' },
        { title: 'Implement Google AI adapter', priority: 'high', type: 'story', desc: 'Test and discover models from Google AI API' },
        { title: 'Implement Ollama adapter', priority: 'medium', type: 'story', desc: 'Test and discover models from local Ollama' },
        { title: 'Implement Model Discovery endpoint', priority: 'high', type: 'story', desc: 'GET /api/llm/providers/:id/discover' },
        { title: 'Implement Model Registry CRUD endpoints', priority: 'high', type: 'story', desc: 'GET/POST/PATCH/DELETE for /api/llm/models' },
        { title: 'Update Agent creation to use registered models', priority: 'high', type: 'story', desc: 'Accept modelId instead of model string' },
        { title: 'Update Talon sync to pass provider credentials', priority: 'high', type: 'story', desc: 'Decrypt and pass API key to Talon' },
        { title: 'Add LLM Registry admin page to web UI', priority: 'high', type: 'story', desc: 'Two-tab page: Providers and Models' },
        { title: 'Update Agent creation modal with provider/model selectors', priority: 'high', type: 'story', desc: 'Add Provider and Model dropdowns' },
        { title: 'Add navigation link for LLM Registry', priority: 'medium', type: 'story', desc: 'Add L button in ControlNav for admin users' },
        { title: 'Implement OpenAI adapter', priority: 'low', type: 'story', desc: 'Support OpenAI models' },
        { title: 'Implement Anthropic adapter', priority: 'low', type: 'story', desc: 'Support Claude models' },
        { title: 'Implement Azure OpenAI adapter', priority: 'low', type: 'story', desc: 'Support Azure deployments' }
    ];

    for (const s of stories) {
        const task = await api('POST', '/api/tasks', {
            projectId: PROJECT_ID,
            columnName: 'Backlog',
            title: s.title,
            description: s.desc,
            type: 'story',
            priority: s.priority,
            assignee: ASSIGNEE,
            createdBy: ASSIGNEE,
            epicId: epic.id,
            epicColor: '#e46307' // Matches "Task Master" project color from user request
        });
        console.log('  ✅ Created Story:', task.title);
    }

    console.log('\nDone! Created 1 epic + ' + stories.length + ' stories');
}

main().catch(e => console.error('Fatal Error:', e));
