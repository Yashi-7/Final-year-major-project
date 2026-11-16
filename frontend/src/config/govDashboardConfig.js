// Display constants for the Government Dashboard. Status names/labels come from fraConfig.js.
export const STATUS_COLORS = {
  APPLICATION_RECEIVED: '#9ca3af',
  PENDING: '#f59e0b',
  UNDER_REVIEW: '#0ea5e9',
  FORWARDED: '#6366f1',
  APPROVED: '#2f8f3f',
  REJECTED: '#ef4444',
};

// The dashboard must always make clear WHAT KIND of data a section shows.
export const SOURCE_INFO = {
  OFFICIAL: { label: 'Connected data', tone: 'green', note: 'These numbers come from claims recorded in the system for your area.' },
  DEMO: { label: 'Demo / Illustrative Data', tone: 'amber', note: 'These are demo records for testing. They are not official government records.' },
};

export const REQUIRING_ACTION_HINT = 'Received, pending or under review';
