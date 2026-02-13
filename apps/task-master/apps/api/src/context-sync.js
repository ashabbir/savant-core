function hasMarkdownChange(files) {
  return (files || []).some((file) => /\.mdx?$/i.test(String(file || '').trim()));
}

export function shouldQueueReindex(eventType, files = []) {
  const normalized = String(eventType || '').trim().toLowerCase();
  if (normalized === 'pr.merged') return true;
  if (normalized === 'markdown.updated') return hasMarkdownChange(files);
  return false;
}

export function buildReindexPayload(repo) {
  return {
    repo_id: String(repo.id),
    path: String(repo.repoPath),
    name: String(repo.repoName),
    agent_id: 'shared'
  };
}
