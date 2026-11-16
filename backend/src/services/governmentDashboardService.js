import { CLAIM_STATUSES, DATA_SOURCES, REQUIRES_ACTION_STATUSES } from '../utils/fraClaimRules.js';
import { buildClaimScopeFilter, describeArea, normalizeAreas } from '../utils/jurisdiction.js';
import { getAgricultureInsights } from './agricultureInsightsService.js';

const DAY = 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 8;
const DISTRICT_LIMIT = 8;
const SOURCE_LABEL = { OFFICIAL: 'Connected data', DEMO: 'Demo / Illustrative Data' };

const emptyByStatus = () => Object.fromEntries(CLAIM_STATUSES.map((s) => [s, 0]));
const isCount = (n) => Number.isInteger(n) && n >= 0;
const iso = (d) => (d ? new Date(d).toISOString() : null);

const buildView = (source, rows, now) => {
  const byStatus = emptyByStatus();
  const districts = new Map();
  let withBoundary = 0;
  let oldestOpen = null;

  for (const r of rows) {
    byStatus[r.status] += r.count;
    withBoundary += r.withBoundary;
    const name = r.district || 'Not recorded';
    const d = districts.get(name) || { district: name, total: 0, requiringAction: 0 };
    d.total += r.count;
    if (REQUIRES_ACTION_STATUSES.includes(r.status)) {
      d.requiringAction += r.count;
      if (r.oldestSubmittedAt) {
        const t = new Date(r.oldestSubmittedAt).getTime();
        if (Number.isFinite(t) && (oldestOpen === null || t < oldestOpen)) oldestOpen = t;
      }
    }
    districts.set(name, d);
  }

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const requiringAction = REQUIRES_ACTION_STATUSES.reduce((n, s) => n + byStatus[s], 0);
  const sorted = [...districts.values()].sort((a, b) => b.requiringAction - a.requiringAction || b.total - a.total || a.district.localeCompare(b.district));

  return {
    source,
    label: SOURCE_LABEL[source],
    totals: {
      total,
      pending: byStatus.PENDING,
      underReview: byStatus.UNDER_REVIEW,
      approved: byStatus.APPROVED,
      rejected: byStatus.REJECTED,
      requiringAction,
      byStatus,
    },
    districts: sorted.slice(0, DISTRICT_LIMIT),
    districtCount: sorted.length,
    oldestOpenClaimDays: oldestOpen === null ? null : Math.max(0, Math.floor((now - oldestOpen) / DAY)),
    boundaries: { withBoundary, withoutBoundary: total - withBoundary, total },
    recentActivity: [],
  };
};

/**
 * Government dashboard summary. Framework- and database-free: the repository and clock are injected.
 *
 * SECURITY / JURISDICTION: the ONLY input is the authenticated user. The scope filter is derived from the user's
 * stored jurisdiction. A user without a valid jurisdiction gets an empty, clearly-labelled result and the database
 * is not queried at all.
 */
export const createGovernmentDashboardService = ({ repository, getInsights = getAgricultureInsights, now = () => Date.now() }) => ({
  async getSummary({ user }) {
    const areas = normalizeAreas(user?.jurisdiction?.areas);
    const generatedAt = new Date(now()).toISOString();
    const scope = {
      assigned: areas.length > 0,
      areas: areas.map((a) => ({ ...a, label: describeArea(a) })),
    };

    if (areas.length === 0) {
      return { generatedAt, scope, views: [], defaultSource: null, insights: getInsights([]) };
    }

    const scopeFilter = buildClaimScopeFilter(areas);
    const rawRows = await repository.statusMatrix(scopeFilter);

    // Trust nothing about the shape returned by the store.
    const rows = (Array.isArray(rawRows) ? rawRows : []).filter(
      (r) => DATA_SOURCES.includes(r?.dataSource) && CLAIM_STATUSES.includes(r?.status) && isCount(r?.count) && isCount(r?.withBoundary ?? 0)
    ).map((r) => ({ ...r, withBoundary: r.withBoundary ?? 0 }));

    const views = [];
    for (const source of ['OFFICIAL', 'DEMO']) {          // never mixed: one view per data source
      const sourceRows = rows.filter((r) => r.dataSource === source);
      if (sourceRows.length === 0) continue;
      const view = buildView(source, sourceRows, now());
      const events = await repository.recentEvents(scopeFilter, source, RECENT_LIMIT);
      view.recentActivity = (Array.isArray(events) ? events : []).slice(0, RECENT_LIMIT).map((e) => ({
        claimId: e.claimId,
        status: e.status,
        changedAt: iso(e.changedAt),
        note: typeof e.note === 'string' && e.note.trim() ? e.note : null,
        district: e.district || null,
        village: e.village || null,
      }));
      views.push(view);
    }

    return { generatedAt, scope, views, defaultSource: views[0]?.source ?? null, insights: getInsights(areas) };
  },
});
