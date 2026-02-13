
import crypto from 'node:crypto';

// Default key for development only - in production this must be set via ENV
const DEFAULT_DEV_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

function getMasterKey() {
    const hexKey = process.env.LLM_ENCRYPTION_KEY || DEFAULT_DEV_KEY;
    if (!hexKey) {
        throw new Error('LLM_ENCRYPTION_KEY is required');
    }
    // If key is provided as hex string, convert to buffer
    if (hexKey.length === 64) {
        return Buffer.from(hexKey, 'hex');
    }
    // Try base64
    if (hexKey.length === 44) {
        return Buffer.from(hexKey, 'base64');
    }
    throw new Error('LLM_ENCRYPTION_KEY must be a 32-byte hex or base64 string');
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param {string} text - The text to encrypt
 * @returns {object} { encrypted: Buffer, nonce: Buffer, tag: Buffer }
 */
export function encrypt(text) {
    if (!text) return null;

    const masterKey = getMasterKey();
    const nonce = crypto.randomBytes(12); // 96-bit nonce for GCM

    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, nonce);

    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const tag = cipher.getAuthTag();

    return {
        encrypted,
        nonce,
        tag
    };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param {Buffer} encrypted - The encrypted data
 * @param {Buffer} nonce - The initialization vector
 * @param {Buffer} tag - The auth tag
 * @returns {string} The decrypted text
 */
export function decrypt(encrypted, nonce, tag) {
    if (!encrypted || !nonce || !tag) return null;

    const masterKey = getMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, nonce);

    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
}
