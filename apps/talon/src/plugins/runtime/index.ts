import { createRequire } from "node:module";
import type { PluginRuntime } from "./types.js";
import { registerMemoryCli } from "../../cli/memory-cli.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import { createMemoryGetTool, createMemorySearchTool } from "../../agents/tools/memory-tool.js";
import { shouldLogVerbose } from "../../globals.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { getChildLogger } from "../../logging.js";
import { normalizeLogLevel } from "../../logging/levels.js";
import { isVoiceCompatibleAudio } from "../../media/audio.js";
import { mediaKindFromMime } from "../../media/constants.js";
import { getImageMetadata, resizeToJpeg } from "../../media/image-ops.js";
import { detectMime } from "../../media/mime.js";
import { runCommandWithTimeout } from "../../process/exec.js";
import { loadWebMedia } from "../../web/media.js";
import { formatNativeDependencyHint } from "./native-deps.js";

let cachedVersion: string | null = null;

function resolveVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../../package.json") as { version?: string };
    cachedVersion = pkg.version ?? "unknown";
    return cachedVersion;
  } catch {
    cachedVersion = "unknown";
    return cachedVersion;
  }
}

export function createPluginRuntime(): PluginRuntime {
  return {
    version: resolveVersion(),
    config: {
      loadConfig,
      writeConfigFile,
    },
    system: {
      enqueueSystemEvent,
      runCommandWithTimeout,
      formatNativeDependencyHint,
    },
    media: {
      loadWebMedia,
      detectMime,
      mediaKindFromMime,
      isVoiceCompatibleAudio,
      getImageMetadata,
      resizeToJpeg,
    },
    tools: {
      createMemoryGetTool,
      createMemorySearchTool,
      registerMemoryCli,
    },
    logging: {
      shouldLogVerbose,
      getChildLogger: (bindings, opts) => {
        const logger = getChildLogger(bindings, {
          level: opts?.level ? normalizeLogLevel(opts.level) : undefined,
        });
        return {
          debug: (message) => logger.debug?.(message),
          info: (message) => logger.info(message),
          warn: (message) => logger.warn(message),
          error: (message) => logger.error(message),
        };
      },
    },
    state: {
      resolveStateDir,
    },
  };
}

export type { PluginRuntime } from "./types.js";
