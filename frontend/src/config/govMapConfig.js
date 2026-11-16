// Display configuration for the Government GIS Map. The claim colours reuse the dashboard's palette so a status
// means the same colour everywhere in the app.
import { STATUS_COLORS } from './govDashboardConfig.js';
import { STATUS_META, CLAIM_TYPE_LABELS } from './fraConfig.js';

export { STATUS_COLORS, STATUS_META, CLAIM_TYPE_LABELS };

export const MAP_EMPTY_FILTERS = { status: '', claimType: '', district: '', dateFrom: '', dateTo: '' };

// India, roughly. Used only as the initial view before any claims are loaded / when nothing has geometry.
export const DEFAULT_MAP_CENTER = [22.5, 80];
export const DEFAULT_MAP_ZOOM = 5;
