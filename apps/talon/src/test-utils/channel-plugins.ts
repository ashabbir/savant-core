import type { PluginRegistry, RegisteredPlugin } from "../plugins/registry.js";

export const createTestRegistry = (
  channels: RegisteredPlugin[] = [],
  overrides: Partial<PluginRegistry> = {},
): PluginRegistry => {
  const base: PluginRegistry = {
    plugins: channels,
    tools: [],
    hooks: [],
    typedHooks: [],
    channels,
    providers: [],
    gatewayHandlers: {},
    httpHandlers: [],
    httpRoutes: [],
    cliRegistrars: [],
    services: [],
    commands: [],
    diagnostics: [],
  };

  const merged = { ...base, ...overrides };
  return {
    ...merged,
    gatewayHandlers: merged.gatewayHandlers ?? {},
    httpHandlers: merged.httpHandlers ?? [],
    httpRoutes: merged.httpRoutes ?? [],
    channels: merged.channels ?? channels,
    plugins: merged.plugins ?? channels,
  };
};
