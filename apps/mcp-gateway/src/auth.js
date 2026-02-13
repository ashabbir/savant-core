import crypto from 'node:crypto';

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function verifyHs256(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'Malformed token' };
  const [header, payload, signature] = parts;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  if (signature !== expected) return { ok: false, reason: 'Invalid signature' };

  const parsedPayload = JSON.parse(decodeBase64Url(payload));
  if (parsedPayload?.exp && Date.now() / 1000 > Number(parsedPayload.exp)) {
    return { ok: false, reason: 'Token expired' };
  }

  return { ok: true, payload: parsedPayload };
}

export function validateGatewayAuth(headerValue) {
  const secret = String(process.env.CONTEXT_GATEWAY_JWT_SECRET || '').trim();
  if (!secret) return { ok: true };

  const header = String(headerValue || '');
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    return { ok: false, reason: 'Missing bearer token' };
  }

  const token = header.slice(prefix.length).trim();
  return verifyHs256(token, secret);
}
