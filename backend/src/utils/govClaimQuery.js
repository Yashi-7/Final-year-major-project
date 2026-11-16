// Query building for the government claim list. Pure functions (no database import) so they can be unit-tested.
//
// SCOPE IS MANDATORY: composeScoped() is the only way the repository builds a claim filter, and it refuses to run
// without a jurisdiction filter. Everything a caller asks for (status, district, search, dates...) is ANDed with the
// scope, so no combination of filters can reach a claim outside the official's jurisdiction.

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const composeScoped = (scope, extraClauses = []) => {
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).length === 0) {
    throw new Error('A jurisdiction filter is required for every claim query.');
  }
  return { $and: [scope, ...extraClauses] };
};

const dayStart = (d) => new Date(`${d}T00:00:00.000Z`);
const dayEnd = (d) => new Date(`${d}T23:59:59.999Z`);

/** Turns validated list parameters into filter clauses (all plain equality / escaped-regex / date-range). */
export const buildListClauses = (q) => {
  const clauses = [];
  if (q.status) clauses.push({ status: q.status });
  if (q.claimType) clauses.push({ claimType: q.claimType });
  if (q.dataSource) clauses.push({ dataSource: q.dataSource });
  if (q.district) clauses.push({ 'location.district': q.district });
  if (q.dateFrom || q.dateTo) {
    // Application date, whole UTC days, both ends inclusive.
    clauses.push({ submittedAt: { ...(q.dateFrom ? { $gte: dayStart(q.dateFrom) } : {}), ...(q.dateTo ? { $lte: dayEnd(q.dateTo) } : {}) } });
  }
  if (q.search) {
    const rx = { $regex: escapeRegex(q.search), $options: 'i' };   // search text is escaped: it is never a pattern
    clauses.push({ $or: [{ claimId: rx }, { 'applicant.fullName': rx }, { 'applicant.village': rx }] });
  }
  return clauses;
};

const SORT_FIELDS = { updatedAt: 'updatedAt', submittedAt: 'submittedAt', claimId: 'claimId' };

/** Allow-listed sort with _id as a tie-breaker so pages are stable. */
export const buildSort = ({ sort = 'updatedAt', order = 'desc' } = {}) => {
  const field = SORT_FIELDS[sort] || 'updatedAt';
  const dir = order === 'asc' ? 1 : -1;
  return { [field]: dir, _id: dir };
};
