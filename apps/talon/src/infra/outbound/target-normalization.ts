export function normalizeChannelTargetInput(raw: string): string {
  return raw.trim();
}

export function normalizeTargetForProvider(provider: string, raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  return raw.trim().toLowerCase() || undefined;
}

export function buildTargetResolverSignature(channel: string): string {
  return hashSignature(`${channel}|default`);
}

function hashSignature(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
