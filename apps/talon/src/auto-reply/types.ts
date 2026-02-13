export type ReplyPayload = {
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    [key: string]: any;
};

export type MsgContext = {
    [key: string]: any;
};
