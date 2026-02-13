import { spawnSync } from 'node:child_process';

export function resolveSavantContextBin() {
  return process.env.SAVANT_CONTEXT_BIN || 'savant-context';
}

export function runSavantContext(args, options = {}) {
  const bin = resolveSavantContextBin();
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 15000,
    env: process.env,
    ...(options.cwd ? { cwd: options.cwd } : {})
  });

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error || null
  };
}

export function readSavantContextVersion(runner = runSavantContext) {
  const result = runner(['--version']);
  if (result.status !== 0) {
    const reason = result.stderr || result.error?.message || 'unknown error';
    throw new Error(`savant-context --version failed: ${reason}`);
  }
  return result.stdout.trim() || 'unknown';
}
