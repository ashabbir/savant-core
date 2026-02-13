import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJarvisContextCommand,
  formatJarvisContextCommandResult,
  executeJarvisContextCommand
} from '../src/jarvis-context-command.js';

test('parseJarvisContextCommand parses code search command', () => {
  const parsed = parseJarvisContextCommand('/code-search savant-core createContextMcpTool');
  assert.deepEqual(parsed, {
    type: 'tool',
    tool: 'code_search',
    args: { repo: 'savant-core', query: 'createContextMcpTool' }
  });
});

test('parseJarvisContextCommand supports aliases', () => {
  const parsed = parseJarvisContextCommand('/read savant-core apps/talon/src/agents/tools/context-mcp-tool.ts');
  assert.equal(parsed?.type, 'tool');
  assert.equal(parsed?.tool, 'code_read');
  assert.equal(parsed?.args?.repo, 'savant-core');
});

test('parseJarvisContextCommand returns help object on malformed command', () => {
  const parsed = parseJarvisContextCommand('/search savant-core');
  assert.equal(parsed?.type, 'help');
  assert.match(parsed?.error || '', /Usage:/);
});

test('formatJarvisContextCommandResult formats list repos result', () => {
  const text = formatJarvisContextCommandResult(
    { type: 'tool', tool: 'list_repos', args: {} },
    {
      repos: [{ repo_name: 'savant-core', files_indexed: 10, chunks_indexed: 20, indexed_at: 'now' }]
    }
  );
  assert.match(text, /savant-core/);
  assert.match(text, /Files: 10/);
});

test('executeJarvisContextCommand calls MCP Gateway tool endpoint', async () => {
  const command = { type: 'tool', tool: 'code_search', args: { repo: 'savant-core', query: 'foo' } };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => ({ ok: true, data: [{ file: 'a.ts', line: 1 }] })
    };
  };

  const result = await executeJarvisContextCommand({
    command,
    gatewayUrl: 'http://mcp-gateway:4444',
    gatewayToken: 'token',
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/mcps\/context\/tools\/code_search\/run$/);
  assert.equal(calls[0].init.method, 'POST');
});
