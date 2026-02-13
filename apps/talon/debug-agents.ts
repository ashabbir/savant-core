import { agentRegistry } from './src/agents/registry.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '../../data/agents.json');

console.log('__dirname:', __dirname);
console.log('DATA_FILE:', DATA_FILE);
console.log('Agents in registry:', JSON.stringify(agentRegistry.list(), null, 2));
