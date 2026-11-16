// Single source of truth for role-based navigation and role labels.
// Sidebar, header title, user menu and the Unauthorized page all read from here.
// Keep these lists exactly as specified — no Admin / Reports / Data Explorer entries.
export const ROLE_LABEL = {
  FARMER: 'Farmer',
  GOVERNMENT_OFFICIAL: 'Government Official',
};

export const ROLE_HOME = {
  FARMER: '/farmer/dashboard',
  GOVERNMENT_OFFICIAL: '/government/dashboard',
};

export const ROLE_PROFILE = {
  FARMER: '/farmer/profile',
  GOVERNMENT_OFFICIAL: '/government/profile',
};

export const NAV_LINKS = {
  FARMER: [
    { label: 'Dashboard', to: '/farmer/dashboard', icon: 'dashboard' },
    { label: 'Crop Recommendation', to: '/farmer/crop-recommendation', icon: 'sprout' },
    { label: 'Yield Prediction', to: '/farmer/yield-prediction', icon: 'trend' },
    { label: 'FRA Monitoring', to: '/farmer/fra-monitoring', icon: 'shield' },
    { label: 'Profile', to: '/farmer/profile', icon: 'user' },
  ],
  GOVERNMENT_OFFICIAL: [
    { label: 'Government Dashboard', to: '/government/dashboard', icon: 'dashboard' },
    { label: 'FRA Claim Management', to: '/government/fra-claim-management', icon: 'file' },
    { label: 'Government GIS Map', to: '/government/gis-map', icon: 'map' },
    { label: 'Profile', to: '/government/profile', icon: 'user' },
  ],
};
