/**
 * System-wide invariants for the final product. These are the "confirm that..." requirements written as repeatable
 * tests, so they keep holding as the code changes:
 *   - exactly two roles (FARMER, GOVERNMENT_OFFICIAL); no Admin anywhere
 *   - email + password authentication only; no OTP / SMS / phone verification
 *   - no prohibited standalone modules (Historical Analysis, Data Explorer, Reports, Processing Analysis)
 *   - API error handling is consistent and does not leak internals in production
 *   - CORS is an allow-list with credentials; no hardcoded secrets are committed
 *
 * Most checks read the real source files as text (the backend's Mongoose/Express dependencies are not needed for
 * that). The error handler has no dependencies, so its behaviour is executed for real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import errorHandler from '../src/middleware/errorHandler.js';
import authorize from '../src/middleware/roleMiddleware.js';
import { mockRes, runChain } from './helpers.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);            // project-root
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const ML = path.join(ROOT, 'ml-service');

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*#.*$/gm, '');

const walk = (dir, exts, skip = ['node_modules', '__pycache__', '.git', 'dist', 'models']) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (skip.includes(e.name)) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full, exts, skip);
    return exts.some((x) => e.name.endsWith(x)) ? [full] : [];
  });

// Product code only: tests legitimately contain words like "admin" (e.g. prototype-pollution fixtures).
const backendSource = walk(path.join(BACKEND, 'src'), ['.js']).concat(walk(path.join(BACKEND, 'scripts'), ['.js']), [path.join(BACKEND, 'server.js')]);
const frontendSource = walk(path.join(FRONTEND, 'src'), ['.js', '.jsx']);
const mlSource = walk(ML, ['.py']).filter((f) => !f.includes(`${path.sep}tests${path.sep}`));
const allProduct = [...backendSource, ...frontendSource, ...mlSource];

// ================================================================== roles
test('exactly two roles exist: FARMER and GOVERNMENT_OFFICIAL', () => {
  assert.match(read('backend/src/models/User.js'), /USER_ROLES = \['FARMER', 'GOVERNMENT_OFFICIAL'\]/);
  // No other role-like constant or enum is defined anywhere in backend or frontend product code.
  for (const file of [...backendSource, ...frontendSource]) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    const found = new Set(code.match(/'[A-Z]+(?:_[A-Z]+)*_(?:OFFICIAL|ADMIN|MANAGER|OFFICER|SUPERVISOR|STAFF|OPERATOR|REVIEWER)'/g) || []);
    found.delete("'GOVERNMENT_OFFICIAL'");
    assert.deepEqual([...found], [], `${path.relative(ROOT, file)} mentions an extra role-like value`);
  }
});

test('registration only accepts the two roles (validator whitelist)', () => {
  const v = stripComments(read('backend/src/validators/authValidators.js'));
  assert.match(v, /USER_ROLES/);
  assert.doesNotMatch(v, /ADMIN/i);
});

test('the frontend register form offers exactly Farmer and Government Official', () => {
  const src = read('frontend/src/pages/Register.jsx');
  const options = [...src.matchAll(/<option value="([A-Z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options.sort(), ['FARMER', 'GOVERNMENT_OFFICIAL']);
});

test('role authorization: authorize() lets only the named role through and treats everything else as forbidden', async () => {
  const as = (user) => (req, res, next) => { req.user = user; return next(); };
  const ok = async (user, role) => (await runChain([as(user), authorize(role), (rq, rs) => rs.status(200).json({ ok: true })], {})).statusCode;
  assert.equal(await ok({ role: 'FARMER' }, 'FARMER'), 200);
  assert.equal(await ok({ role: 'GOVERNMENT_OFFICIAL' }, 'GOVERNMENT_OFFICIAL'), 200);
  assert.equal(await ok({ role: 'GOVERNMENT_OFFICIAL' }, 'FARMER'), 403);
  assert.equal(await ok({ role: 'FARMER' }, 'GOVERNMENT_OFFICIAL'), 403);
  for (const role of ['ADMIN', 'admin', 'SUPERADMIN', '', undefined, null, 'farmer']) {
    assert.equal(await ok({ role }, 'FARMER'), 403, String(role));
    assert.equal(await ok({ role }, 'GOVERNMENT_OFFICIAL'), 403, String(role));
  }
});

// ================================================================== no admin
test('NO ADMIN: no admin route, controller, UI, seed account, database role, test account or documentation', () => {
  const offenders = [];
  for (const file of allProduct) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    if (/\badmin(istrator|istration)?\b/i.test(code)) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, [], `admin references found in: ${offenders.join(', ')}`);

  // No file or directory is named after admin functionality.
  const names = [...walk(BACKEND, ['.js', '.json']), ...walk(FRONTEND, ['.js', '.jsx', '.json']), ...walk(ML, ['.py'])]
    .filter((f) => !f.includes('package-lock'))
    .map((f) => path.basename(f).toLowerCase());
  assert.deepEqual(names.filter((n) => n.includes('admin')), []);
});

test('NO ADMIN in documentation, other than statements that it does not exist', () => {
  const readme = read('README.md');
  const lines = readme.split('\n').filter((l) => /\badmin\b/i.test(l));
  for (const line of lines) {
    assert.match(line, /\b(no|not|without|never|cannot|nor|neither)\b/i, `README line mentions admin without denying it: ${line.trim().slice(0, 120)}`);
  }
});

test('NO ADMIN in seed data: demo accounts are farmers and government officials only', () => {
  const seed = read('backend/src/seed/demoFraClaims.js');
  assert.doesNotMatch(seed, /admin/i);
  const roles = [...read('backend/scripts/seedDemoFraClaims.js').matchAll(/role: '([A-Z_]+)'/g)].map((m) => m[1]);
  assert.ok(roles.length > 0);
  for (const r of roles) assert.ok(['FARMER', 'GOVERNMENT_OFFICIAL'].includes(r), r);
});

// ================================================================== authentication: email + password only
test('authentication uses only email and password (no OTP, SMS, phone or verification codes)', () => {
  const banned = /\b(otp|one[-_ ]?time[-_ ]?(password|code|pin)|sms|twilio|msg91|verification[-_ ]?code|phone(number)?|mobile(number)?|totp|2fa|two[-_ ]?factor)\b/i;
  const offenders = allProduct.filter((f) => banned.test(stripComments(fs.readFileSync(f, 'utf8')))).map((f) => path.relative(ROOT, f));
  assert.deepEqual(offenders, [], `found in: ${offenders.join(', ')}`);
});

test('login accepts exactly { email, password }; registration exactly { fullName, email, password, role }', () => {
  const ctrl = stripComments(read('backend/src/controllers/authController.js'));
  assert.match(ctrl, /const \{ fullName, email, password, role \} = req\.body;/);
  assert.match(ctrl, /const \{ email, password \} = req\.body;/);
  const login = fs.readFileSync(path.join(FRONTEND, 'src/pages/Login.jsx'), 'utf8');
  const fields = [...login.matchAll(/<input[^>]*\bname="([a-zA-Z]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(fields, ['email', 'password']);
});

test('no OTP / SMS / phone dependency is declared in any package manifest', () => {
  const manifests = [read('backend/package.json'), read('frontend/package.json'), read('ml-service/requirements.txt')].join('\n');
  assert.doesNotMatch(manifests, /twilio|nexmo|vonage|otplib|speakeasy|msg91|firebase|passwordless|sendgrid|nodemailer/i);
});

test('the profile update endpoint can change the display name only (not email, role, password or jurisdiction)', () => {
  const ctrl = stripComments(read('backend/src/controllers/authController.js'));
  const update = ctrl.slice(ctrl.indexOf('export const updateMe'));
  // The update document is a fixed, explicit object: nothing else from the request body can reach the database.
  assert.match(update, /findByIdAndUpdate\(\s*req\.user\._id,\s*\{ fullName: req\.body\.fullName \}/);
  assert.doesNotMatch(update, /\.\.\.req\.body|Object\.assign\([^)]*req\.body|req\.body\.(email|role|password|jurisdiction)/);
  assert.match(read('backend/src/routes/authRoutes.js'), /router\.patch\('\/me', authenticate, updateProfileValidator, validate, updateMe\)/);
  // and the auth endpoints never touch jurisdiction at all (it is assigned by an operator script only)
  assert.doesNotMatch(ctrl, /jurisdiction/i);
});

// ================================================================== prohibited modules
const FORBIDDEN_MODULES = [/historical[\s_-]?analysis/i, /data[\s_-]?explorer/i, /processing[\s_-]?analysis/i, /\bReportsPage\b|\/reports\b|Reports\.jsx|pages\/reports/i];

test('PROHIBITED MODULES: no Historical Analysis, Data Explorer, Reports or Processing Analysis page, route, nav item or API', () => {
  const offenders = [];
  for (const file of [...backendSource, ...frontendSource]) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    for (const rx of FORBIDDEN_MODULES) if (rx.test(code)) offenders.push(`${path.relative(ROOT, file)} ~ ${rx}`);
  }
  assert.deepEqual(offenders, []);
  // no files named after them either
  const files = [...backendSource, ...frontendSource].map((f) => path.basename(f).toLowerCase());
  for (const bad of ['historical', 'dataexplorer', 'processinganalysis', 'reports']) {
    assert.deepEqual(files.filter((n) => n.includes(bad)), [], bad);
  }
});

test('navigation lists exactly the intended items for each role, and nothing else', async () => {
  const nav = await import(new URL('../../frontend/src/config/navigation.js', import.meta.url));
  const labels = (role) => nav.NAV_LINKS[role].map((l) => l.label);
  assert.deepEqual(labels('FARMER'), ['Dashboard', 'Crop Recommendation', 'Yield Prediction', 'FRA Monitoring', 'Profile']);
  assert.deepEqual(labels('GOVERNMENT_OFFICIAL'), ['Government Dashboard', 'FRA Claim Management', 'Government GIS Map', 'Profile']);
  assert.deepEqual(Object.keys(nav.NAV_LINKS).sort(), ['FARMER', 'GOVERNMENT_OFFICIAL']);
});

test('the Government Dashboard integrates analytics itself instead of linking to separate modules', () => {
  const page = read('frontend/src/pages/government/GovernmentDashboard.jsx');
  assert.match(page, /Operational agriculture insights/);
  assert.doesNotMatch(page, /to="\/government\/(reports|analysis|explorer|historical)/i);
});

// ================================================================== error handling
const captureHandler = (err, { env = 'test' } = {}) => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = env;
  try {
    const res = mockRes();
    errorHandler(err, { method: 'GET', originalUrl: '/api/x' }, res, () => {});
    return res;
  } finally {
    process.env.NODE_ENV = saved;
  }
};

test('error handler: consistent JSON shape { success: false, message } for every error', () => {
  for (const err of [new Error('boom'), Object.assign(new Error('bad input'), { status: 400 }), Object.assign(new Error('nope'), { statusCode: 403 })]) {
    const res = captureHandler(err);
    assert.equal(res.body.success, false);
    assert.equal(typeof res.body.message, 'string');
  }
});

test('error handler: library status codes are honoured (malformed JSON -> 400, oversized -> 413, CORS -> 403)', () => {
  assert.equal(captureHandler(Object.assign(new Error('Unexpected token'), { status: 400 })).statusCode, 400);
  assert.equal(captureHandler(Object.assign(new Error('too large'), { status: 413 })).statusCode, 413);
  assert.equal(captureHandler(Object.assign(new Error('Not allowed by CORS'), { status: 403 })).statusCode, 403);
  assert.equal(captureHandler(new Error('unknown')).statusCode, 500);
});

test('error handler PRODUCTION: 5xx errors show a generic message (no driver / framework internals), 4xx keep theirs, no stack', () => {
  const secret = 'connect ECONNREFUSED mongodb://user:pass@10.0.0.5:27017/geo_rural';
  const serverErr = captureHandler(new Error(secret), { env: 'production' });
  assert.equal(serverErr.statusCode, 500);
  assert.equal(serverErr.body.message, 'Internal Server Error');
  assert.equal(JSON.stringify(serverErr.body).includes('mongodb'), false);
  assert.equal(JSON.stringify(serverErr.body).includes('pass'), false);
  assert.equal('stack' in serverErr.body, false);

  const clientErr = captureHandler(Object.assign(new Error('Email already registered.'), { status: 409 }), { env: 'production' });
  assert.equal(clientErr.body.message, 'Email already registered.');
});

test('error handler: the stack trace appears only in development', () => {
  assert.ok('stack' in captureHandler(new Error('x'), { env: 'development' }).body);
  for (const env of ['production', 'test', undefined]) assert.equal('stack' in captureHandler(new Error('x'), { env }).body, false, String(env));
});

test('error handler logs server-side errors for the developer (and only outside the test environment)', () => {
  const logged = [];
  const original = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  try {
    captureHandler(new Error('db exploded'), { env: 'development' });
    assert.ok(logged.some((l) => l.includes('db exploded') && l.includes('/api/x') && l.includes('500')));
    logged.length = 0;
    captureHandler(Object.assign(new Error('bad'), { status: 400 }), { env: 'development' });
    assert.equal(logged.length, 0, '4xx are not logged as errors');
    captureHandler(new Error('quiet in tests'), { env: 'test' });
    assert.equal(logged.length, 0);
  } finally {
    console.error = original;
  }
});

test('every controller responds through the shared { success, message } shape (no ad-hoc error formats)', () => {
  const bad = [];
  for (const file of backendSource.filter((f) => f.includes(`${path.sep}controllers${path.sep}`))) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    for (const m of code.matchAll(/\.json\(\{([^}]*)\}\)/g)) {
      if (/status:\s*['"]error|error:\s*['"`]/.test(m[1])) bad.push(`${path.basename(file)}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ================================================================== CORS, secrets, environment
test('CORS: an origin allow-list with credentials, never a wildcard', () => {
  const app = stripComments(read('backend/src/app.js'));
  assert.match(app, /process\.env\.CORS_ORIGIN/);
  assert.match(app, /credentials: true/);
  assert.match(app, /allowedOrigins\.includes\(origin\)/);
  assert.doesNotMatch(app, /origin:\s*['"]\*['"]|origin:\s*true/);
  assert.match(app, /status: 403/, 'a disallowed origin is a 403, not a 500');
});

test('the auth cookie is httpOnly and SameSite, and Secure in production', () => {
  const util = stripComments(read('backend/src/utils/generateToken.js'));
  assert.match(util, /const isProduction = process\.env\.NODE_ENV === 'production'/);
  assert.match(util, /httpOnly: true/);
  assert.match(util, /secure: isProduction/);
  assert.match(util, /sameSite: isProduction \? 'strict' : 'lax'/);
  // the same options are used when clearing the cookie on logout, otherwise browsers would not remove it
  assert.equal((util.match(/httpOnly: true/g) || []).length, 2);
});

test('JWT signing refuses to run without a secret', () => {
  assert.match(read('backend/src/utils/generateToken.js'), /JWT_SECRET/);
  assert.match(read('backend/src/utils/generateToken.js'), /throw new Error/);
});

test('passwords are hashed with bcrypt and never returned', () => {
  const model = read('backend/src/models/User.js');
  assert.match(model, /bcrypt\.hash\(/);
  assert.match(model, /select: false/, 'password is excluded from queries by default');
  assert.match(model, /toSafeObject/);
});

test('SECRETS: no real .env file, key, or credential is committed; .env is git-ignored', () => {
  for (const dir of ['backend', 'frontend', 'ml-service']) {
    assert.equal(fs.existsSync(path.join(ROOT, dir, '.env')), false, `${dir}/.env must not exist in the repository`);
  }
  const ignore = read('.gitignore');
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /node_modules/);
  const secretLike = /(secret|password|passwd|api[_-]?key|token)\s*[:=]\s*['"][A-Za-z0-9+/_\-]{12,}['"]/i;
  const offenders = allProduct.filter((f) => secretLike.test(stripComments(fs.readFileSync(f, 'utf8')))).map((f) => path.relative(ROOT, f));
  assert.deepEqual(offenders, [], `hard-coded secret-like values in: ${offenders.join(', ')}`);
});

test('ENVIRONMENT: every process.env variable the backend reads is documented in backend/.env.example', () => {
  const used = new Set();
  for (const f of backendSource) for (const m of fs.readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
  used.delete('NODE_ENV');                     // set by the runtime / npm scripts, documented separately
  const documented = new Set([...read('backend/.env.example').matchAll(/^#?\s*([A-Z][A-Z0-9_]+)\s*=/gm)].map((m) => m[1]));
  const missing = [...used].filter((v) => !documented.has(v));
  assert.deepEqual(missing, [], `undocumented env vars: ${missing.join(', ')}`);
});

test('ENVIRONMENT: the frontend and ML service variables are documented too', () => {
  const feUsed = new Set();
  for (const f of frontendSource) for (const m of fs.readFileSync(f, 'utf8').matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]+)/g)) feUsed.add(m[1]);
  feUsed.delete('BASE_URL');                   // built into Vite
  const feDoc = read('frontend/.env.example');
  for (const v of feUsed) assert.match(feDoc, new RegExp(`^${v}=`, 'm'), v);

  const mlUsed = new Set();
  for (const f of mlSource) for (const m of fs.readFileSync(f, 'utf8').matchAll(/os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]+)["']/g)) mlUsed.add(m[1]);
  const mlDoc = read('ml-service/.env.example');
  for (const v of mlUsed) assert.match(mlDoc, new RegExp(`^#?\\s*${v}=`, 'm'), v);
});

test('the server fails fast when critical configuration is missing', () => {
  assert.match(read('backend/src/config/db.js'), /MONGO_URI is not defined/);
  assert.match(read('backend/src/utils/generateToken.js'), /JWT_SECRET/);
});

// ================================================================== ML separation and honesty
test('ML: crop recommendation and yield prediction share no model code', () => {
  const imports = (dir) => walk(path.join(ML, dir), ['.py']).flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/^\s*(?:from|import)\s+([A-Za-z_.]+)/gm)].map((m) => m[1]));
  assert.equal(imports('crop_recommendation').some((i) => i.startsWith('yield_prediction')), false);
  assert.equal(imports('yield_prediction').some((i) => i.startsWith('crop_recommendation')), false);
  // and they are separate backend modules with separate endpoints
  assert.ok(fs.existsSync(path.join(BACKEND, 'src/services/cropRecommendationService.js')));
  assert.ok(fs.existsSync(path.join(BACKEND, 'src/services/yieldPredictionService.js')));
});

test('ML: the yield model is trained on state, season, crop and year only (never area or production)', () => {
  const train = read('ml-service/training/train_yield_prediction.py');
  const usecols = train.split('\n').find((l) => l.startsWith('USECOLS')).split('#')[0];
  assert.deepEqual(JSON.parse(usecols.split('=')[1].trim().replace(/'/g, '"')), ['state', 'season', 'crop', 'year', 'yield']);
  const schema = JSON.parse(read('ml-service/yield_prediction/schema.json'));
  assert.deepEqual(schema.features, ['state', 'season', 'crop', 'year']);
  // the backend and the browser refuse the two columns as inputs
  assert.deepEqual(JSON.parse(read('ml-service/yield_prediction/schema.json')).features.filter((f) => ['area', 'production'].includes(f)), []);
  assert.doesNotMatch(stripComments(read('backend/src/validators/yieldPredictionValidator.js')), /\b(area|production)\b/);
  assert.doesNotMatch(stripComments(read('frontend/src/components/yield/YieldPredictionForm.jsx')), /name="(area|production)"/);
});

test('ML: no prediction value is hardcoded anywhere in the backend, frontend or Flask service', () => {
  const offenders = [];
  for (const file of [...backendSource, ...frontendSource, ...mlSource]) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    if (/\b(prediction|yield|recommend\w*)\s*[:=]\s*\d+(\.\d+)?\s*[,;}\n]/i.test(code)) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, []);
});

test('ML: model metrics are never displayed in the UI (they live in metadata and the README only)', () => {
  const ui = [...frontendSource].map((f) => stripComments(fs.readFileSync(f, 'utf8'))).join('\n');
  assert.doesNotMatch(ui, /holdoutMetrics|precision_at|hit_at|\br2\b|\brmse\b|\bmae\b/i);
});

test('ML: a missing model produces a clear 503 from Flask and a friendly message in Node and React, never a fake result', () => {
  assert.match(read('ml-service/crop_recommendation/routes.py'), /MODEL_UNAVAILABLE/);
  assert.match(read('ml-service/yield_prediction/routes.py'), /MODEL_UNAVAILABLE/);
  assert.match(read('backend/src/services/mlClient.js'), /ML_SERVICE_UNAVAILABLE/);
  assert.match(read('frontend/src/api/yieldPredictionApi.js'), /could not generate a prediction right now|temporarily unavailable|Please try again/i);
  assert.match(read('frontend/src/api/cropRecommendationApi.js'), /could not generate recommendations right now|Please try again/i);
});

// ================================================================== demo data labelling
test('demo data: every seeded claim is flagged DEMO and the UI labels it "Demo / Illustrative Data"', () => {
  const seed = read('backend/src/seed/demoFraClaims.js');
  assert.equal((seed.match(/dataSource: 'DEMO'/g) || []).length >= 1, true);
  assert.doesNotMatch(seed, /dataSource: 'OFFICIAL'/);
  assert.match(read('frontend/src/config/fraConfig.js'), /DEMO_LABEL = 'Demo \/ Illustrative Data'/);
  // the claim model forces the caller to say which it is
  const model = read('backend/src/models/Claim.js');
  const line = model.slice(model.indexOf('dataSource:')).split('\n')[0];
  assert.match(line, /required: true/);
  assert.doesNotMatch(line, /default/);
});

test('demo data: the seed script refuses to run in production and only deletes DEMO records', () => {
  const script = read('backend/scripts/seedDemoFraClaims.js');
  assert.match(script, /NODE_ENV === 'production'/);
  assert.match(script, /deleteMany\(\{ dataSource: 'DEMO' \}\)/);
  assert.match(script, /demo\.invalid|DEMO_EMAIL_DOMAIN/);
});
