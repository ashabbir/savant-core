export async function detectMime(params: { buffer: Buffer }): Promise<string | null> {
    const { buffer } = params;
    if (!buffer || buffer.length < 4) {
        return null;
    }
    // Basic magic bytes detection
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
    ) {
        return "image/png";
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return "image/gif";
    }
    if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46
    ) {
        return "image/webp";
    }
    return null;
}

export function extensionForMime(mime: string): string | null {
    switch (mime) {
        case "image/jpeg":
            return ".jpg";
        case "image/png":
            return ".png";
        case "image/gif":
            return ".gif";
        case "image/webp":
            return ".webp";
        default:
            return null;
    }
}

export function getFileExtension(filename: string): string {
    const parts = filename.split(".");
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : "";
}

export function imageMimeFromFormat(format: string): string {
    switch (format.toLowerCase()) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
        default:
            return `image/${format}`;
    }
}
