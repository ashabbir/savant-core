export function createRepoObserver(params) {
  const queue = params.queue;

  function onRepoCreated(repo) {
    if (!repo?.repoPath || !repo?.repoName || !repo?.id) {
      throw new Error('repo observer requires id, repoName, and repoPath');
    }
    return queue.enqueue('repo.created', {
      repo_id: String(repo.id),
      path: String(repo.repoPath),
      name: String(repo.repoName),
      agent_id: 'shared'
    });
  }

  return {
    onRepoCreated
  };
}
