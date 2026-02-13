import type { SessionEntry, SessionOrigin } from "./types.js";

const mergeOrigin = (
  existing: SessionOrigin | undefined,
  next: SessionOrigin | undefined,
): SessionOrigin | undefined => {
  if (!existing && !next) {
    return undefined;
  }
  const merged: SessionOrigin = existing ? { ...existing } : {};
  if (next?.label) merged.label = next.label;
  if (next?.provider) merged.provider = next.provider;
  if (next?.surface) merged.surface = next.surface;
  if (next?.chatType) merged.chatType = next.chatType;
  if (next?.from) merged.from = next.from;
  if (next?.to) merged.to = next.to;
  if (next?.accountId) merged.accountId = next.accountId;
  if (next?.threadId != null && next.threadId !== "") merged.threadId = next.threadId;
  return Object.keys(merged).length > 0 ? merged : undefined;
};

export function deriveSessionOrigin(ctx: any): SessionOrigin | undefined {
  const origin: SessionOrigin = {};
  if (ctx.Provider) origin.provider = ctx.Provider;
  if (ctx.Surface) origin.surface = ctx.Surface;
  if (ctx.From) origin.from = ctx.From;
  if (ctx.To) origin.to = ctx.To;
  if (ctx.AccountId) origin.accountId = ctx.AccountId;
  return Object.keys(origin).length > 0 ? origin : undefined;
}

export function snapshotSessionOrigin(entry?: SessionEntry): SessionOrigin | undefined {
  if (!entry?.origin) {
    return undefined;
  }
  return { ...entry.origin };
}

export function deriveSessionMetaPatch(params: {
  ctx: any;
  sessionKey: string;
  existing?: SessionEntry;
  groupResolution?: any;
}): Partial<SessionEntry> | null {
  const origin = deriveSessionOrigin(params.ctx);
  if (!origin) {
    return null;
  }

  const patch: Partial<SessionEntry> = {};
  const mergedOrigin = mergeOrigin(params.existing?.origin, origin);
  if (mergedOrigin) {
    patch.origin = mergedOrigin;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
