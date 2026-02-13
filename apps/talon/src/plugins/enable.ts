import type { TalonConfig } from "../config/config.js";

export type PluginEnableResult = {
  config: TalonConfig;
  enabled: boolean;
  reason?: string;
};

function ensureAllowlisted(cfg: TalonConfig, pluginId: string): TalonConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}

export function enablePluginInConfig(cfg: TalonConfig, pluginId: string): PluginEnableResult {
  if (cfg.plugins?.enabled === false) {
    return { config: cfg, enabled: false, reason: "plugins disabled" };
  }
  if (cfg.plugins?.deny?.includes(pluginId)) {
    return { config: cfg, enabled: false, reason: "blocked by denylist" };
  }

  const entries = {
    ...cfg.plugins?.entries,
    [pluginId]: {
      ...(cfg.plugins?.entries?.[pluginId] as Record<string, unknown> | undefined),
      enabled: true,
    },
  };
  let next: TalonConfig = {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      entries,
    },
  };
  next = ensureAllowlisted(next, pluginId);
  return { config: next, enabled: true };
}
