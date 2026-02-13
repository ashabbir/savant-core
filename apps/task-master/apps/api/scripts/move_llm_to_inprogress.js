
import { PrismaClient } from '@prisma/client';

const API_BASE = 'http://localhost:3333';
const PROJECT_ID = '69841b79fc994d7e2152ff8a';

const prisma = new PrismaClient();

async function api(method, path, body, apiKey) {
    const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) throw new Error(`API Error ${method} ${path}: ${res.statusText} ${await res.text()}`);
    return res.json();
}

async function main() {
    try {
        console.log('Fetching admin API Key...');
        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (!admin || !admin.apiKey) {
            console.error('No admin user or API key found.');
            process.exit(1);
        }
        const API_KEY = admin.apiKey;
        console.log(`Using API Key for user: ${admin.username}`);

        const project = await prisma.project.findFirst();
        if (!project) {
            console.error('No project found in database.');
            process.exit(1);
        }
        const PROJECT_ID = project.id;
        console.log(`Using Project ID: ${PROJECT_ID} (${project.name})`);

        console.log('Fetching project columns...');
        const projectRes = await api('GET', `/api/projects/${PROJECT_ID}/board`, null, API_KEY);
        const columns = projectRes.data.columns;
        const tasks = projectRes.data.tasks;

        const inProgressCol = columns.find(c => c.name.toLowerCase().includes('progress'));

        if (!inProgressCol) {
            console.error('Could not find "In Progress" column. Available:', columns.map(c => c.name));
            process.exit(1);
        }
        console.log(`Target Column: ${inProgressCol.name}`);

        // console.log('Fetching tasks...');
        // const tasksRes = await api('GET', `/api/projects/${PROJECT_ID}/tasks`, null, API_KEY);
        // const tasks = tasksRes.data;

        const keywords = [
            'llm', 'provider', 'encryption', 'google', 'ollama', 'model',
            'agent', 'talon', 'registry', 'store', 'sync'
        ];

        console.log(`Analyzing ${tasks.length} tasks...`);
        tasks.forEach(t => console.log(`- ${t.title} (${t.columnName})`));

        const targetTasks = tasks.filter(t => {
            const titleLower = t.title.toLowerCase();
            return keywords.some(k => titleLower.includes(k.toLowerCase()));
        });
        console.log(`Found ${targetTasks.length} LLM-related tasks.`);

        for (const task of targetTasks) {
            if (task.columnName === inProgressCol.name) {
                console.log(`Task "${task.title}" already in ${inProgressCol.name}.`);
                continue;
            }

            console.log(`Moving "${task.title}" to ${inProgressCol.name}...`);
            try {
                // API expects PATCH /api/tasks/:id/move with { columnName, order }
                await api('PATCH', `/api/tasks/${task.id}/move`, { columnName: inProgressCol.name, order: 0 }, API_KEY);
            } catch (e) {
                console.error(`Failed to move ${task.title}:`, e.message);
            }
        }
        console.log('Done!');
    } catch (err) {
        console.error('Script failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
