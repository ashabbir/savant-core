import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import { createSubsystemLogger } from "../logging/subsystem.js";

type ToolContentBlock = AgentToolResult<unknown>["content"][number];
type ImageContentBlock = Extract<ToolContentBlock, { type: "image" }>;
type TextContentBlock = Extract<ToolContentBlock, { type: "text" }>;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const log = createSubsystemLogger("agents/tool-images");

function isImageBlock(block: unknown): block is ImageContentBlock {
  if (!block || typeof block !== "object") {
    return false;
  }
  const rec = block as Record<string, unknown>;
  return rec.type === "image" && typeof rec.data === "string" && typeof rec.mimeType === "string";
}

function isTextBlock(block: unknown): block is TextContentBlock {
  if (!block || typeof block !== "object") {
    return false;
  }
  const rec = block as Record<string, unknown>;
  return rec.type === "text" && typeof rec.text === "string";
}

export async function sanitizeContentBlocksImages(
  blocks: ToolContentBlock[],
  label: string,
  _opts: { maxDimensionPx?: number; maxBytes?: number } = {},
): Promise<ToolContentBlock[]> {
  const maxBytes = Math.max(_opts.maxBytes ?? MAX_IMAGE_BYTES, 1);
  const out: ToolContentBlock[] = [];

  for (const block of blocks) {
    if (!isImageBlock(block)) {
      out.push(block);
      continue;
    }

    const data = block.data.trim();
    if (!data) {
      out.push({
        type: "text",
        text: `[${label}] omitted empty image payload`,
      } satisfies TextContentBlock);
      continue;
    }

    // Basic size check for base64
    const approxBytes = (data.length * 3) / 4;
    if (approxBytes > maxBytes) {
      log.warn("Image exceeds size limits; dropping because image processing is disabled", {
        label,
        approxBytes,
        maxBytes,
      });
      out.push({
        type: "text",
        text: `[${label}] image dropped: exceeds size limit (${(approxBytes / 1024 / 1024).toFixed(2)}MB > ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`,
      } satisfies TextContentBlock);
      continue;
    }

    out.push(block);
  }

  return out;
}

export async function sanitizeImageBlocks(
  images: ImageContent[],
  label: string,
  opts: { maxDimensionPx?: number; maxBytes?: number } = {},
): Promise<{ images: ImageContent[]; dropped: number }> {
  if (images.length === 0) {
    return { images, dropped: 0 };
  }
  const sanitized = await sanitizeContentBlocksImages(images as ToolContentBlock[], label, opts);
  const next = sanitized.filter(isImageBlock);
  return { images: next, dropped: Math.max(0, images.length - next.length) };
}

export async function sanitizeToolResultImages(
  result: AgentToolResult<unknown>,
  label: string,
  opts: { maxDimensionPx?: number; maxBytes?: number } = {},
): Promise<AgentToolResult<unknown>> {
  const content = Array.isArray(result.content) ? result.content : [];
  if (!content.some((b) => isImageBlock(b) || isTextBlock(b))) {
    return result;
  }

  const next = await sanitizeContentBlocksImages(content, label, opts);
  return { ...result, content: next };
}
