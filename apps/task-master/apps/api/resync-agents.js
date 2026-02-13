import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function buildTalonAgentUrl(gatewayUrl, agentId = '') {
  const path = agentId ? `/v1/agents/${agentId}` : '/v1/agents';
  return new URL(path, gatewayUrl).toString();
}

async function syncAgentToTalon(agent, mode = 'create') {
  const gatewayUrl = process.env.TALON_GATEWAY_URL || 'http://talon:18789';
  const token = process.env.TALON_GATEWAY_TOKEN || 'dev-token';
  
  const agentKey = agent.talonAgentId || agent.name || agent.id;
  const url = await buildTalonAgentUrl(gatewayUrl, mode === 'update' ? agentKey : '');
  const method = mode === 'update' ? 'PUT' : 'POST';
  
  const body = {
    id: agentKey,
    name: agent.name,
    role: agent.role || '',
    model: agent.model || '',
    systemPrompt: agent.soul || '',
    guardrails: agent.guardrails || '',
    bootstrap: agent.bootstrap || '',
    repoContext: agent.everyone || ''
  };

  console.log(`Syncing agent ${agent.name} (${agentKey}) via ${method} ${url}...`);
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log(`Result: ${res.status}`, data);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error(`Error syncing ${agent.name}:`, e.message);
    return { ok: false, error: e.message };
  }
}

async function main() {
  const agents = await prisma.agent.findMany();
  for (const agent of agents) {
    await syncAgentToTalon(agent, 'create');
  }
}

main().finally(() => prisma.$disconnect());
