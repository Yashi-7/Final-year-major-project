import http from 'node:http';

/** Minimal Express-like response recorder. */
export const mockRes = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    set(name, value) { this.headers[String(name).toLowerCase()] = String(value); return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
};

/**
 * Runs middleware in order the way Express does: each handler must call next() to
 * continue; a handler that responds without calling next() ends the chain.
 */
export const runChain = async (handlers, req) => {
  const res = mockRes();
  let i = 0;
  const next = async (err) => {
    if (err) throw err;
    const handler = handlers[i++];
    if (handler) await handler(req, res, next);
  };
  await next();
  return res;
};

/** Starts a throwaway HTTP server standing in for the Flask service. */
export const startMockMl = async (handler) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, requests, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }) };
};

export const jsonReply = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
};

export const FLASK_OK = {
  success: true,
  data: {
    recommendations: [
      { rank: 1, crop: 'Wheat', slug: 'wheat', score: 0.91 },
      { rank: 2, crop: 'Barley', slug: 'barley', probability: 0.5 },
      { rank: 3, crop: 'Rapeseed & Mustard', slug: 'rapeseed-mustard' },
    ],
    notice: null,
  },
};

export const VALID_BODY = {
  nitrogen: 130, phosphorus: 48, potassium: 35, ph: 7.9,
  temperature: 24, rainfall: 900, humidity: 45, season: 'Rabi',
};

// ---- Yield prediction fixtures ----
export const YIELD_BODY = { state: 'Punjab', season: 'Rabi', crop: 'Wheat', year: 2015 };

export const YIELD_OK = {
  success: true,
  data: {
    prediction: { value: 4.87, confidence: 0.99 },
    inputs: { state: 'Punjab', season: 'Rabi', crop: 'Wheat', year: 2015, cropLabel: 'Wheat', cropSlug: 'wheat', area: 10 },
    notice: null,
    dataNote: 'Values are on the dataset scale; no unit is shown.',
    debug: { trees: 150 },
  },
};

export const YIELD_OPTIONS_OK = {
  success: true,
  data: {
    years: { min: 1997, max: 2030, trainedMin: 1997, trainedMax: 2020, scaleBreakYear: 2015 },
    states: ['Punjab', 'Kerala'],
    seasonsByState: { Punjab: ['Rabi'], Kerala: ['Whole Year'] },
    cropsByStateSeason: { Punjab: { Rabi: ['Wheat'] }, Kerala: { 'Whole Year': ['Coconut'] } },
    cropLabels: { Wheat: 'Wheat', Coconut: 'Coconut', Unused: 'Unused' },
  },
};
