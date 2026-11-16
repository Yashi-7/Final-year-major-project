/**
 * Thin, safe HTTP client for the Flask ML service (server-to-server only).
 *
 * - base URL comes from ML_SERVICE_URL; the path is always a constant chosen by our code
 * - hard timeout (ML_SERVICE_TIMEOUT_MS, default 8000 ms), no redirects, capped response size
 * - every failure is mapped to an MlServiceError with a stable `code`, an HTTP `status`
 *   for our own response, and a `publicMessage` that never leaks internal URLs or stack traces
 */
export class MlServiceError extends Error {
  constructor(code, status, publicMessage, detail) {
    super(detail || publicMessage);
    this.name = 'MlServiceError';
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

/**
 * The ML service rejected the farmer's input (e.g. an unsupported state/crop combination).
 * Only produced when a caller opts in with `passthroughValidation`; the field errors are
 * sanitised so they can be returned to the browser as a normal 400.
 */
export class MlValidationError extends MlServiceError {
  constructor(errors) {
    super('VALIDATION_ERROR', 400, 'Validation failed', 'ML service rejected the input');
    this.errors = errors;
  }
}

const sanitizeValidationErrors = (errors) =>
  errors
    .filter((e) => e && typeof e.field === 'string' && typeof e.message === 'string')
    .slice(0, 10)
    .map((e) => ({ field: e.field.slice(0, 50), message: e.message.slice(0, 200) }));

const MAX_RESPONSE_CHARS = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

const readConfig = () => {
  const baseUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
  const parsed = Number.parseInt(process.env.ML_SERVICE_TIMEOUT_MS || '', 10);
  const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
  return { baseUrl, timeoutMs, apiKey: process.env.ML_SERVICE_API_KEY || '' };
};

export const requestMlService = async (
  method,
  path,
  payload,
  { fetchImpl = fetch, passthroughValidation = false } = {}
) => {
  const { baseUrl, timeoutMs, apiKey } = readConfig();

  let url;
  try {
    url = new URL(path, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
  } catch {
    throw new MlServiceError('ML_SERVICE_MISCONFIGURED', 500, 'The recommendation service is not configured correctly.', 'Invalid ML_SERVICE_URL');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(apiKey ? { 'X-Internal-Api-Key': apiKey } : {}),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal,
      redirect: 'error',
    });

    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) {
      throw new MlServiceError('ML_INVALID_RESPONSE', 502, 'The recommendation service returned an unexpected response.', 'Response too large');
    }

    if (passthroughValidation && response.status === 400) {
      let body;
      try { body = JSON.parse(text); } catch { body = null; }
      if (body?.code === 'VALIDATION_ERROR' && Array.isArray(body.errors)) {
        const errors = sanitizeValidationErrors(body.errors);
        if (errors.length) throw new MlValidationError(errors);
      }
    }

    if (response.status === 503) {
      throw new MlServiceError('ML_SERVICE_UNAVAILABLE', 503, 'The recommendation service is temporarily unavailable. Please try again shortly.', 'ML service reported 503');
    }
    if (!response.ok) {
      // 4xx here means our validation and Flask's disagree (or a key mismatch): a server-side fault, not the farmer's.
      throw new MlServiceError('ML_SERVICE_ERROR', 502, 'The recommendation service could not process the request.', `ML service responded ${response.status}: ${text.slice(0, 200)}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new MlServiceError('ML_INVALID_RESPONSE', 502, 'The recommendation service returned an unexpected response.', 'Response was not valid JSON');
    }
  } catch (err) {
    if (err instanceof MlServiceError) throw err;
    if (err?.name === 'AbortError') {
      throw new MlServiceError('ML_SERVICE_TIMEOUT', 504, 'The recommendation service took too long to respond. Please try again.', `Timed out after ${timeoutMs}ms`);
    }
    throw new MlServiceError('ML_SERVICE_UNAVAILABLE', 503, 'The recommendation service is temporarily unavailable. Please try again shortly.', `Could not reach ML service: ${err?.cause?.code || err?.message}`);
  } finally {
    clearTimeout(timer);
  }
};

export const postToMlService = (path, payload, options) => requestMlService('POST', path, payload, options);
export const getFromMlService = (path, options) => requestMlService('GET', path, undefined, options);
