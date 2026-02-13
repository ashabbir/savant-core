export function buildError(code, message, details = null, retryable = false) {
  return { code, message, details, retryable };
}

export function errorResponse(res, status, code, message, details = null, retryable = false) {
  return res.status(status).json({ ok: false, error: buildError(code, message, details, retryable) });
}
