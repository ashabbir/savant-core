function updateRepoStatus(repos, repoId, updater) {
  let changed = false;
  const next = repos.map((repo) => {
    if (String(repo?.id || '') !== String(repoId || '')) return repo;
    changed = true;
    return updater(repo);
  });
  return { changed, repos: next };
}

async function readFailureMessage(response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed?.error?.details || parsed?.error?.message || raw;
  } catch {
    return raw;
  }
}

export function createContextIndexWorker(params) {
  const queue = params.queue;
  const readRepos = params.readRepos;
  const writeRepos = params.writeRepos;
  const fetchImpl = params.fetchImpl || fetch;
  const gatewayUrl = params.gatewayUrl || process.env.CONTEXT_GATEWAY_URL || 'http://localhost:4444';
  const gatewayToken = params.gatewayToken || process.env.CONTEXT_GATEWAY_TOKEN || '';

  async function processNext() {
    return queue.processNext(async (job) => {
      if (job.event !== 'repo.created' && job.event !== 'repo.reindex') return;

      const payload = job.payload || {};
      const response = await fetchImpl(new URL('/v1/index/repo', gatewayUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (response.status !== 202) {
        const details = await readFailureMessage(response);
        const repos = readRepos();
        const changed = updateRepoStatus(repos, payload.repo_id, (repo) => ({
          ...repo,
          indexStatus: 'FAILED',
          lastError: String(details || `Gateway index request failed: ${response.status}`),
          updatedAt: new Date().toISOString()
        }));
        if (changed.changed) {
          writeRepos(changed.repos);
        }
        throw new Error(`Gateway index request failed: ${response.status} ${details}`);
      }

      let responseData = null;
      try {
        const parsed = await response.json();
        responseData = parsed?.data || null;
      } catch {
        responseData = null;
      }

      const repos = readRepos();
      const changed = updateRepoStatus(repos, payload.repo_id, (repo) => ({
        ...repo,
        indexStatus: 'INDEXING',
        indexAcceptedAt: new Date().toISOString(),
        worktreePath: responseData?.worktree_path ? String(responseData.worktree_path) : repo.worktreePath,
        updatedAt: new Date().toISOString()
      }));
      if (changed.changed) {
        writeRepos(changed.repos);
      }
    });
  }

  return { processNext };
}
