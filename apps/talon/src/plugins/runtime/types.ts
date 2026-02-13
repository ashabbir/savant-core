import type { LogLevel } from "../../logging/levels.js";

type ShouldLogVerbose = typeof import("../../globals.js").shouldLogVerbose;
type ResolveStateDir = typeof import("../../config/paths.js").resolveStateDir;
type LoadConfig = typeof import("../../config/config.js").loadConfig;
type WriteConfigFile = typeof import("../../config/config.js").writeConfigFile;
type EnqueueSystemEvent = typeof import("../../infra/system-events.js").enqueueSystemEvent;
type RunCommandWithTimeout = typeof import("../../process/exec.js").runCommandWithTimeout;
type FormatNativeDependencyHint = typeof import("./native-deps.js").formatNativeDependencyHint;
type LoadWebMedia = typeof import("../../web/media.js").loadWebMedia;
type DetectMime = typeof import("../../media/mime.js").detectMime;
type MediaKindFromMime = typeof import("../../media/constants.js").mediaKindFromMime;
type IsVoiceCompatibleAudio = typeof import("../../media/audio.js").isVoiceCompatibleAudio;
type GetImageMetadata = typeof import("../../media/image-ops.js").getImageMetadata;
type ResizeToJpeg = typeof import("../../media/image-ops.js").resizeToJpeg;
type CreateMemoryGetTool = typeof import("../../agents/tools/memory-tool.js").createMemoryGetTool;
type CreateMemorySearchTool =
  typeof import("../../agents/tools/memory-tool.js").createMemorySearchTool;
type RegisterMemoryCli = typeof import("../../cli/memory-cli.js").registerMemoryCli;

export type RuntimeLogger = {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type PluginRuntime = {
  version: string;
  config: {
    loadConfig: LoadConfig;
    writeConfigFile: WriteConfigFile;
  };
  system: {
    enqueueSystemEvent: EnqueueSystemEvent;
    runCommandWithTimeout: RunCommandWithTimeout;
    formatNativeDependencyHint: FormatNativeDependencyHint;
  };
  media: {
    loadWebMedia: LoadWebMedia;
    detectMime: DetectMime;
    mediaKindFromMime: MediaKindFromMime;
    isVoiceCompatibleAudio: IsVoiceCompatibleAudio;
    getImageMetadata: GetImageMetadata;
    resizeToJpeg: ResizeToJpeg;
  };
  tools: {
    createMemoryGetTool: CreateMemoryGetTool;
    createMemorySearchTool: CreateMemorySearchTool;
    registerMemoryCli: RegisterMemoryCli;
  };
  logging: {
    shouldLogVerbose: ShouldLogVerbose;
    getChildLogger: (
      bindings?: Record<string, unknown>,
      opts?: { level?: LogLevel },
    ) => RuntimeLogger;
  };
  state: {
    resolveStateDir: ResolveStateDir;
  };
};
