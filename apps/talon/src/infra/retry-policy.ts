import { formatErrorMessage } from "./errors.js";
import { type RetryConfig, resolveRetryConfig, retryAsync } from "./retry.js";

export type RetryRunner = <T>(fn: () => Promise<T>, label?: string) => Promise<T>;

export function createGenericRetryRunner(params: {
  retry?: RetryConfig;
  configRetry?: RetryConfig;
  verbose?: boolean;
  shouldRetry?: (err: unknown) => boolean;
}): RetryRunner {
  const defaults = {
    attempts: 3,
    minDelayMs: 500,
    maxDelayMs: 30_000,
    jitter: 0.1,
  };
  const retryConfig = resolveRetryConfig(defaults, {
    ...params.configRetry,
    ...params.retry,
  });
  const shouldRetry = params.shouldRetry ?? (() => true);

  return <T>(fn: () => Promise<T>, label?: string) =>
    retryAsync(fn, {
      ...retryConfig,
      label,
      shouldRetry,
      onRetry: params.verbose
        ? (info) => {
          const labelText = info.label ?? label ?? "request";
          const maxRetries = Math.max(1, info.maxAttempts - 1);
          console.warn(
            `retry ${info.attempt}/${maxRetries} for ${labelText} in ${info.delayMs}ms: ${formatErrorMessage(info.err)}`,
          );
        }
        : undefined,
    });
}
