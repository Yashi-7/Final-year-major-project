// Aggregation pipelines for the government dashboard, kept free of any database import so they can be
// unit-tested. SECURITY: the first stage of EVERY pipeline is the caller's jurisdiction filter, and every field
// that leaves the database is listed explicitly (no applicant names, owners, geometry, or history authors).

/** One row per (dataSource, district, status): counts, boundary counts and the oldest application date. */
export const statusMatrixPipeline = (scopeFilter) => [
  { $match: scopeFilter },
  {
    $group: {
      _id: { dataSource: '$dataSource', district: '$location.district', status: '$status' },
      count: { $sum: 1 },
      withBoundary: { $sum: { $cond: [{ $eq: [{ $type: '$geometry' }, 'object'] }, 1, 0] } },
      oldestSubmittedAt: { $min: '$submittedAt' },
    },
  },
  {
    $project: {
      _id: 0,
      dataSource: '$_id.dataSource',
      district: '$_id.district',
      status: '$_id.status',
      count: 1,
      withBoundary: 1,
      oldestSubmittedAt: 1,
    },
  },
];

/** Latest status-change events for one data source, newest first. Only workflow facts; no personal data. */
export const recentEventsPipeline = (scopeFilter, dataSource, limit) => [
  { $match: { $and: [scopeFilter, { dataSource }] } },
  { $project: { claimId: 1, 'location.district': 1, 'location.village': 1, statusHistory: 1 } },
  { $unwind: '$statusHistory' },
  { $sort: { 'statusHistory.changedAt': -1, claimId: 1 } },
  { $limit: limit },
  {
    $project: {
      _id: 0,
      claimId: 1,
      district: '$location.district',
      village: '$location.village',
      status: '$statusHistory.status',
      changedAt: '$statusHistory.changedAt',
      note: '$statusHistory.publicNote',
    },
  },
];
