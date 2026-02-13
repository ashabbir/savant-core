import type { TalonConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { AgentCommandOpts } from "./types.js";
import { AGENT_LANE_NESTED } from "../../agents/lanes.js";
import { createOutboundSendDeps, type CliDeps } from "../../cli/outbound-send-deps.js";
import {
  resolveAgentDeliveryPlan,
} from "../../infra/outbound/agent-delivery.js";
import { buildOutboundResultEnvelope } from "../../infra/outbound/envelope.js";
import {
  formatOutboundPayloadLog,
  type NormalizedOutboundPayload,
  normalizeOutboundPayloads,
  normalizeOutboundPayloadsForJson,
} from "../../infra/outbound/payloads.js";

type RunResult = Awaited<
  ReturnType<(typeof import("../../agents/pi-embedded.js"))["runEmbeddedPiAgent"]>
>;

const NESTED_LOG_PREFIX = "[agent:nested]";

function formatNestedLogPrefix(opts: AgentCommandOpts): string {
  const parts = [NESTED_LOG_PREFIX];
  const session = opts.sessionKey ?? opts.sessionId;
  if (session) {
    parts.push(`session=${session}`);
  }
  if (opts.runId) {
    parts.push(`run=${opts.runId}`);
  }
  const channel = opts.messageChannel ?? opts.channel;
  if (channel) {
    parts.push(`channel=${channel}`);
  }
  if (opts.to) {
    parts.push(`to=${opts.to}`);
  }
  if (opts.accountId) {
    parts.push(`account=${opts.accountId}`);
  }
  return parts.join(" ");
}

function logNestedOutput(runtime: RuntimeEnv, opts: AgentCommandOpts, output: string) {
  const prefix = formatNestedLogPrefix(opts);
  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      continue;
    }
    runtime.log(`${prefix} ${line}`);
  }
}

export async function deliverAgentCommandResult(params: {
  cfg: TalonConfig;
  deps: CliDeps;
  runtime: RuntimeEnv;
  opts: AgentCommandOpts;
  sessionEntry: SessionEntry | undefined;
  result: RunResult;
  payloads: RunResult["payloads"];
}) {
  const { runtime, opts, payloads, result } = params;
  const deliver = opts.deliver === true;

  const normalizedPayloads = normalizeOutboundPayloadsForJson(payloads ?? []);
  if (opts.json) {
    runtime.log(
      JSON.stringify(
        buildOutboundResultEnvelope({
          payloads: normalizedPayloads,
          meta: result.meta,
        }),
        null,
        2,
      ),
    );
    if (!deliver) {
      return { payloads: normalizedPayloads, meta: result.meta };
    }
  }

  if (!payloads || payloads.length === 0) {
    runtime.log("No reply from agent.");
    return { payloads: [], meta: result.meta };
  }

  const deliveryPayloads = normalizeOutboundPayloads(payloads);
  const logPayload = (payload: NormalizedOutboundPayload) => {
    if (opts.json) {
      return;
    }
    const output = formatOutboundPayloadLog(payload);
    if (!output) {
      return;
    }
    if (opts.lane === AGENT_LANE_NESTED) {
      logNestedOutput(runtime, opts, output);
      return;
    }
    runtime.log(output);
  };

  for (const payload of deliveryPayloads) {
    logPayload(payload);
  }

  if (deliver) {
    // Other channels removed. Only support local output logging here.
  }

  return { payloads: normalizedPayloads, meta: result.meta };
}
