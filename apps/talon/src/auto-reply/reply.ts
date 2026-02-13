import type { ReplyPayload } from "./types.js";

export async function getReplyFromConfig(_ctx: any, _opts: any, _cfg: any): Promise<ReplyPayload | ReplyPayload[]> {
    return { text: "" };
}
