// Display configuration for Government FRA Claim Management.
// The workflow itself (which actions exist and where they lead) is NOT defined here: the server sends the actions
// allowed for each claim, so the state machine lives in exactly one place (backend/src/utils/claimWorkflow.js).
export const SORT_OPTIONS = [
  { key: 'updated_desc', label: 'Recently updated', sort: 'updatedAt', order: 'desc' },
  { key: 'updated_asc', label: 'Least recently updated', sort: 'updatedAt', order: 'asc' },
  { key: 'applied_desc', label: 'Newest applications', sort: 'submittedAt', order: 'desc' },
  { key: 'applied_asc', label: 'Oldest applications', sort: 'submittedAt', order: 'asc' },
  { key: 'id_asc', label: 'Claim ID (A to Z)', sort: 'claimId', order: 'asc' },
];

export const PAGE_SIZES = [10, 25, 50];
export const SEARCH_DEBOUNCE_MS = 350;
export const MAX_TEXT = 1000;

export const EMPTY_FILTERS = { search: '', status: '', claimType: '', district: '', dataSource: '', dateFrom: '', dateTo: '' };

export const DATA_SOURCE_LABELS = { OFFICIAL: 'Connected data', DEMO: 'Demo / Illustrative Data' };
