/**
 * Frontend route-guard tests: the REAL App.jsx route table, ProtectedRoute and RoleRedirect, exercised for every role
 * on every route. Run with `npm test` (Node's built-in runner; needs only the packages `npm install` already provides).
 *
 * How it works: esbuild (a dependency of Vite) bundles App.jsx. Only the parts that are not under test are replaced:
 *   - page components and DashboardLayout -> tiny markers (<div data-page="Name">), so the test sees WHICH page won
 *   - AuthContext's useAuth              -> returns whatever the test sets (anonymous / farmer / official / ...)
 *   - react-router-dom                   -> a small server-side router with the same matching rules the app relies on
 *                                           (exact paths, layout routes with <Outlet/>, `*` catch-all) and a <Navigate>
 *                                           that the test follows hop by hop, like a browser would.
 *
 * NOTE: these guards are a UX convenience. The security boundary is the backend (authenticate + authorize + jurisdiction),
 * which has its own tests. This suite proves the browser never renders the wrong area for a role and never flashes a
 * protected page while the session is still being checked.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../src');
const esbuild = require('esbuild');

// ------------------------------------------------------------------ stand-ins for the parts NOT under test
const ROUTER_STUB = `
import { createContext, createElement as h, useContext } from 'react';
const LocationCtx = createContext({ pathname: '/' });
const ChainCtx = createContext([]);
const toArray = (c) => (Array.isArray(c) ? c.flat(Infinity) : [c]).filter(Boolean);

// First route whose path equals the location; layout/guard routes (no path) are searched recursively;
// the '*' catch-all only wins when nothing else matches (react-router ranks static paths above it).
const find = (routes, pathname) => {
  for (const r of toArray(routes)) {
    const { path: p, children } = r.props;
    if (p === undefined) { const inner = find(children, pathname); if (inner) return [r, ...inner]; }
    else if (p === pathname) return [r];
  }
  for (const r of toArray(routes)) if (r.props.path === '*') return [r];
  return null;
};
const renderChain = (chain) => h(ChainCtx.Provider, { value: chain.slice(1) }, chain[0].props.element);

export const LocationProvider = ({ pathname, children }) => h(LocationCtx.Provider, { value: { pathname } }, children);
export const Routes = ({ children }) => { const { pathname } = useContext(LocationCtx); const chain = find(children, pathname); return chain ? renderChain(chain) : null; };
export const Route = () => null;
export const Outlet = () => { const rest = useContext(ChainCtx); return rest.length ? renderChain(rest) : null; };
export const Navigate = ({ to }) => h('div', { 'data-navigate': to });
`;
const AUTH_STUB = `export const useAuth = () => globalThis.__AUTH__; export const AuthProvider = ({ children }) => children;`;
const pageStub = (name) => `import { createElement as h } from 'react'; export default () => h('div', { 'data-page': '${name}' });`;
const LAYOUT_STUB = `import { createElement as h } from 'react'; import { Outlet } from 'react-router-dom'; export default () => h('div', { 'data-layout': 'dashboard' }, h(Outlet));`;

const stubPlugin = {
  name: 'route-guard-stubs',
  setup(build) {
    build.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: 'react-router-dom', namespace: 'stub' }));
    build.onResolve({ filter: /^\./ }, (args) => {
      if (!args.resolveDir.startsWith(SRC)) return null;
      const abs = path.resolve(args.resolveDir, args.path);
      const rel = path.relative(SRC, abs).split(path.sep).join('/');
      if (rel === 'context/AuthContext.jsx') return { path: rel, namespace: 'stub' };
      if (rel === 'components/layout/DashboardLayout.jsx') return { path: rel, namespace: 'stub' };
      if (rel.startsWith('pages/')) return { path: rel, namespace: 'stub' };
      return null;
    });
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      let contents;
      if (args.path === 'react-router-dom') contents = ROUTER_STUB;
      else if (args.path === 'context/AuthContext.jsx') contents = AUTH_STUB;
      else if (args.path === 'components/layout/DashboardLayout.jsx') contents = LAYOUT_STUB;
      else contents = pageStub(path.basename(args.path, '.jsx'));
      return { contents, loader: 'jsx', resolveDir: here };
    });
  },
};

// ------------------------------------------------------------------ build once, render many times
let tmpDir;
let render;

before(async () => {
  const entry = `
    import { createElement as h } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { LocationProvider } from 'react-router-dom';
    import App from ${JSON.stringify(path.join(SRC, 'App.jsx'))};
    export const render = (pathname, auth) => { globalThis.__AUTH__ = auth; return renderToStaticMarkup(h(LocationProvider, { pathname }, h(App))); };
  `;
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: here, loader: 'jsx', sourcefile: 'entry.jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [stubPlugin],
  });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-guards-'));
  const file = path.join(tmpDir, 'bundle.cjs');
  fs.writeFileSync(file, result.outputFiles[0].text);
  ({ render } = require(file));
});

after(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

// ------------------------------------------------------------------ helpers
const ANON = { user: null, loading: false };
const LOADING = { user: null, loading: true };
const asUser = (role) => ({ user: { _id: 'u1', fullName: 'Test', role }, loading: false });
const FARMER = asUser('FARMER');
const OFFICIAL = asUser('GOVERNMENT_OFFICIAL');
const TAMPERED = asUser('ADMIN');           // a role that does not exist in the system (e.g. edited client state)

/** Follows <Navigate> redirects like a browser would and reports where the user ends up. */
const visit = (start, auth) => {
  let pathname = start;
  const hops = [];
  for (let i = 0; i < 6; i += 1) {
    const html = render(pathname, auth);
    const nav = /data-navigate="([^"]+)"/.exec(html);
    if (!nav) {
      return { pathname, hops, page: /data-page="([^"]+)"/.exec(html)?.[1] ?? null, layout: html.includes('data-layout'), spinner: html.includes('animate-spin'), html };
    }
    hops.push(nav[1]);
    pathname = nav[1];
  }
  throw new Error(`redirect loop starting at ${start}`);
};

// The route table is read from App.jsx itself, so a newly added page is automatically covered by the matrix below.
const appSource = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
const routes = [...appSource.matchAll(/<Route path="([^"]+)" element=\{<(\w+) \/>\}/g)].map((m) => ({ path: m[1], page: m[2] }));
const farmerRoutes = routes.filter((r) => r.path.startsWith('/farmer/'));
const officialRoutes = routes.filter((r) => r.path.startsWith('/government/'));
const publicRoutes = routes.filter((r) => !r.path.startsWith('/farmer/') && !r.path.startsWith('/government/') && r.path !== '*');

test('the route table was read correctly from App.jsx', () => {
  assert.deepEqual(farmerRoutes.map((r) => r.path), ['/farmer/dashboard', '/farmer/crop-recommendation', '/farmer/yield-prediction', '/farmer/fra-monitoring', '/farmer/profile']);
  assert.deepEqual(officialRoutes.map((r) => r.path), ['/government/dashboard', '/government/fra-claim-management', '/government/gis-map', '/government/profile']);
  assert.deepEqual(publicRoutes.map((r) => r.path).sort(), ['/', '/login', '/register', '/unauthorized']);
});

test('there is no route for anything outside the two roles (no admin area, no forbidden modules)', () => {
  for (const r of routes.filter((x) => x.path !== '*')) assert.ok(/^\/(farmer|government)\/|^\/(login|register|unauthorized)?$/.test(r.path), r.path);
  assert.doesNotMatch(appSource, /admin|otp|historical|data-explorer|processing-analysis|\/reports/i);
});

// ------------------------------------------------------------------ farmer area
test('FARMER reaches every farmer page (inside the dashboard layout)', () => {
  for (const r of farmerRoutes) {
    const v = visit(r.path, FARMER);
    assert.equal(v.page, r.page, r.path);
    assert.equal(v.pathname, r.path);
    assert.equal(v.layout, true, `${r.path} should render inside the dashboard layout`);
    assert.deepEqual(v.hops, []);
  }
});

test('GOVERNMENT_OFFICIAL is redirected to /unauthorized from every farmer page and never sees one', () => {
  for (const r of farmerRoutes) {
    const v = visit(r.path, OFFICIAL);
    assert.equal(v.pathname, '/unauthorized', r.path);
    assert.equal(v.page, 'Unauthorized');
    assert.equal(v.layout, false);
    assert.notEqual(v.page, r.page);
  }
});

test('anonymous visitors are sent to /login from every farmer page', () => {
  for (const r of farmerRoutes) {
    const v = visit(r.path, ANON);
    assert.equal(v.pathname, '/login', r.path);
    assert.equal(v.page, 'Login');
  }
});

// ------------------------------------------------------------------ government area
test('GOVERNMENT_OFFICIAL reaches every government page (inside the dashboard layout)', () => {
  for (const r of officialRoutes) {
    const v = visit(r.path, OFFICIAL);
    assert.equal(v.page, r.page, r.path);
    assert.equal(v.pathname, r.path);
    assert.equal(v.layout, true);
    assert.deepEqual(v.hops, []);
  }
});

test('FARMER is redirected to /unauthorized from every government page (dashboard, claim management, GIS map, profile)', () => {
  for (const r of officialRoutes) {
    const v = visit(r.path, FARMER);
    assert.equal(v.pathname, '/unauthorized', r.path);
    assert.equal(v.page, 'Unauthorized');
    assert.equal(v.layout, false);
    assert.notEqual(v.page, r.page);
  }
});

test('anonymous visitors are sent to /login from every government page', () => {
  for (const r of officialRoutes) {
    const v = visit(r.path, ANON);
    assert.equal(v.pathname, '/login', r.path);
    assert.equal(v.page, 'Login');
  }
});

// ------------------------------------------------------------------ tampered / unknown roles
test('a role that does not exist (e.g. "ADMIN" injected into client state) is refused everywhere; it never reaches a protected page', () => {
  for (const r of [...farmerRoutes, ...officialRoutes]) {
    const v = visit(r.path, TAMPERED);
    assert.equal(v.pathname, '/unauthorized', r.path);
    assert.equal(v.page, 'Unauthorized');
  }
  // and the role redirect at "/" does not invent a destination for it
  assert.equal(visit('/', TAMPERED).pathname, '/login');
  for (const role of ['', undefined, null, 'farmer', 'government_official', 'SUPERUSER']) {
    for (const r of [...farmerRoutes, ...officialRoutes]) assert.equal(visit(r.path, asUser(role)).page, 'Unauthorized', `${String(role)} ${r.path}`);
  }
});

// ------------------------------------------------------------------ role-based redirection
test('ROLE REDIRECT at "/": anonymous -> /login, FARMER -> farmer dashboard, GOVERNMENT_OFFICIAL -> government dashboard', () => {
  const anon = visit('/', ANON);
  assert.deepEqual([anon.pathname, anon.page], ['/login', 'Login']);
  const farmer = visit('/', FARMER);
  assert.deepEqual([farmer.pathname, farmer.page, farmer.hops], ['/farmer/dashboard', 'FarmerDashboard', ['/farmer/dashboard']]);
  const official = visit('/', OFFICIAL);
  assert.deepEqual([official.pathname, official.page, official.hops], ['/government/dashboard', 'GovernmentDashboard', ['/government/dashboard']]);
});

// ------------------------------------------------------------------ session check in flight
test('while the session is still being checked, protected pages show a spinner: no redirect, no page content flashes', () => {
  for (const r of [...farmerRoutes, ...officialRoutes]) {
    const v = visit(r.path, LOADING);
    assert.equal(v.spinner, true, r.path);
    assert.deepEqual(v.hops, [], `${r.path} must not redirect before the session check finishes`);
    assert.equal(v.page, null, `${r.path} must not render page content while loading`);
    assert.equal(v.layout, false);
  }
  const root = visit('/', LOADING);
  assert.equal(root.spinner, true);
  assert.deepEqual(root.hops, []);
});

// ------------------------------------------------------------------ public pages and 404
test('public pages are reachable by anyone, and unknown URLs show the not-found page (never a protected page)', () => {
  for (const auth of [ANON, FARMER, OFFICIAL, LOADING]) {
    assert.equal(visit('/login', auth).page, 'Login');
    assert.equal(visit('/register', auth).page, 'Register');
    assert.equal(visit('/unauthorized', auth).page, 'Unauthorized');
    for (const junk of ['/nope', '/admin', '/admin/users', '/farmer', '/government', '/farmer/nope', '/reports', '/otp', '/data-explorer']) {
      const v = visit(junk, auth);
      assert.equal(v.page, 'NotFound', `${junk} for ${JSON.stringify(auth.user?.role)}`);
      assert.equal(v.layout, false);
    }
  }
});
