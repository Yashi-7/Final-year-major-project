// Development-only DEMO / ILLUSTRATIVE FRA claims. Pure data builder (no database) so it can be tested.
// Nothing here is official government data: names, villages and boundaries are invented, and every
// claim is flagged dataSource: 'DEMO' so the UI labels it "Demo / Illustrative Data".

const DAY = 24 * 60 * 60 * 1000;

export const DEMO_EMAIL_DOMAIN = 'demo.invalid';
export const DEMO_FARMER_ONE = { fullName: 'Demo Farmer One', email: `demo.farmer.one@${DEMO_EMAIL_DOMAIN}` };
export const DEMO_FARMER_TWO = { fullName: 'Demo Farmer Two', email: `demo.farmer.two@${DEMO_EMAIL_DOMAIN}` };

// Demo GOVERNMENT_OFFICIAL users with different jurisdictions, for testing the dashboard's scope filtering.
export const DEMO_OFFICIALS = [
  { fullName: 'Demo Official (Madhya Pradesh)', email: `demo.official.mp@${DEMO_EMAIL_DOMAIN}`, areas: [{ state: 'Madhya Pradesh' }] },
  { fullName: 'Demo Official (Balaghat)', email: `demo.official.balaghat@${DEMO_EMAIL_DOMAIN}`, areas: [{ state: 'Madhya Pradesh', district: 'Balaghat' }] },
  { fullName: 'Demo Official (Odisha)', email: `demo.official.od@${DEMO_EMAIL_DOMAIN}`, areas: [{ state: 'Odisha' }] },
  { fullName: 'Demo Official (Assam, no claims)', email: `demo.official.assam@${DEMO_EMAIL_DOMAIN}`, areas: [{ state: 'Assam' }] },
  { fullName: 'Demo Official (no area assigned)', email: `demo.official.none@${DEMO_EMAIL_DOMAIN}`, areas: [] },
];

// A small, slightly irregular closed ring (~250 m) around a point. GeoJSON order: [lng, lat].
const patch = (lng, lat, d = 0.0025) => [[
  [lng, lat], [lng + d, lat + d * 0.15], [lng + d * 1.1, lat + d], [lng + d * 0.3, lat + d * 1.2],
  [lng - d * 0.1, lat + d * 0.6], [lng, lat],
]];

const entry = (status, daysAgo, publicNote, now) => ({ status, changedAt: new Date(now - daysAgo * DAY), publicNote });

/**
 * @param farmerOneId  owner of the first set (a demo user, or an existing FARMER chosen with --farmer-email)
 * @param farmerTwoId  owner of the second set (always the demo user, used for privacy tests)
 */
export const buildDemoClaims = ({ farmerOneId, farmerTwoId, now = Date.now() }) => {
  const base = (over) => ({
    dataSource: 'DEMO',
    ...over,
  });

  return [
    // ---- Farmer One ----
    base({
      claimId: 'FRA-MP-2025-DEMO01', farmer: farmerOneId, claimType: 'IFR', status: 'UNDER_REVIEW', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant One', village: 'Demo Gram One' },
      location: { state: 'Madhya Pradesh', district: 'Balaghat', tehsil: 'Demo Tehsil', village: 'Demo Gram One', gramPanchayat: 'Demo Panchayat', claimedAreaHectares: 1.8 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha One', subDivisionalCommittee: 'Demo SDLC (Illustrative)', districtCommittee: 'Demo DLC (Illustrative)' },
      geometry: { type: 'Polygon', coordinates: patch(80.185, 21.805) },
      submittedAt: new Date(now - 60 * DAY),
      statusHistory: [
        entry('APPLICATION_RECEIVED', 60, 'Application received at the Gram Sabha.', now),
        entry('PENDING', 45, 'Documents are being checked.', now),
        entry('UNDER_REVIEW', 12, 'Claim is being reviewed by the committee.', now),
      ],
    }),
    base({
      claimId: 'FRA-MP-2024-DEMO02', farmer: farmerOneId, claimType: 'CFR', status: 'APPROVED', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant One', village: 'Demo Gram One' },
      location: { state: 'Madhya Pradesh', district: 'Balaghat', tehsil: 'Demo Tehsil', village: 'Demo Gram One', gramPanchayat: 'Demo Panchayat', claimedAreaHectares: 5.2 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha One', subDivisionalCommittee: 'Demo SDLC (Illustrative)', districtCommittee: 'Demo DLC (Illustrative)' },
      // two separate patches -> exercises MultiPolygon rendering
      geometry: { type: 'MultiPolygon', coordinates: [patch(80.2, 21.82), patch(80.207, 21.826, 0.002)] },
      submittedAt: new Date(now - 400 * DAY),
      statusHistory: [
        entry('APPLICATION_RECEIVED', 400, 'Application received.', now),
        entry('UNDER_REVIEW', 340, null, now),
        entry('FORWARDED', 250, 'Forwarded to the district level committee.', now),
        entry('APPROVED', 120, 'Claim approved.', now),
      ],
    }),
    base({
      claimId: 'FRA-MP-2024-DEMO03', farmer: farmerOneId, claimType: 'IFR', status: 'REJECTED',
      rejectionReason: 'Demo reason: supporting evidence of occupation before the cut-off date was not provided.',
      applicant: { fullName: 'Demo Applicant One', village: 'Demo Gram One' },
      location: { state: 'Madhya Pradesh', district: 'Balaghat', tehsil: 'Demo Tehsil', village: 'Demo Gram One', gramPanchayat: 'Demo Panchayat', claimedAreaHectares: 0.9 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha One', subDivisionalCommittee: 'Demo SDLC (Illustrative)', districtCommittee: 'Demo DLC (Illustrative)' },
      geometry: { type: 'Polygon', coordinates: patch(80.17, 21.79) },
      submittedAt: new Date(now - 300 * DAY),
      statusHistory: [
        entry('APPLICATION_RECEIVED', 300, 'Application received.', now),
        entry('PENDING', 280, null, now),
        entry('UNDER_REVIEW', 200, null, now),
        entry('REJECTED', 90, 'Claim was not accepted. See the reason shown.', now),
      ],
    }),
    base({
      // no boundary recorded yet -> exercises the map "empty" state
      claimId: 'FRA-MP-2025-DEMO06', farmer: farmerOneId, claimType: 'CR', status: 'APPLICATION_RECEIVED', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant One', village: 'Demo Gram One' },
      location: { state: 'Madhya Pradesh', district: 'Balaghat', tehsil: 'Demo Tehsil', village: 'Demo Gram One', gramPanchayat: 'Demo Panchayat', claimedAreaHectares: null },
      jurisdiction: { gramSabha: 'Demo Gram Sabha One' },
      geometry: undefined,
      submittedAt: new Date(now - 3 * DAY),
      statusHistory: [entry('APPLICATION_RECEIVED', 3, 'Application received. Boundary survey not yet recorded.', now)],
    }),

    // ---- Farmer Two (used to prove Farmer One can never see these) ----
    base({
      claimId: 'FRA-OD-2025-DEMO04', farmer: farmerTwoId, claimType: 'IFR', status: 'PENDING', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant Two', village: 'Demo Gram Two' },
      location: { state: 'Odisha', district: 'Koraput', tehsil: 'Demo Block', village: 'Demo Gram Two', gramPanchayat: 'Demo Panchayat Two', claimedAreaHectares: 2.4 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha Two', subDivisionalCommittee: 'Demo SDLC Two (Illustrative)', districtCommittee: 'Demo DLC Two (Illustrative)' },
      geometry: { type: 'Polygon', coordinates: patch(82.7, 18.8) },
      submittedAt: new Date(now - 20 * DAY),
      statusHistory: [
        entry('APPLICATION_RECEIVED', 20, 'Application received.', now),
        entry('PENDING', 10, 'Waiting for verification.', now),
      ],
    }),
    base({
      claimId: 'FRA-CG-2025-DEMO05', farmer: farmerTwoId, claimType: 'IFR', status: 'FORWARDED', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant Two', village: 'Demo Gram Three' },
      location: { state: 'Chhattisgarh', district: 'Bastar', tehsil: 'Demo Block', village: 'Demo Gram Three', gramPanchayat: 'Demo Panchayat Three', claimedAreaHectares: 3.1 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha Three', subDivisionalCommittee: 'Demo SDLC Three (Illustrative)', districtCommittee: 'Demo DLC Three (Illustrative)' },
      geometry: { type: 'Polygon', coordinates: patch(82.03, 19.07) },
      submittedAt: new Date(now - 90 * DAY),
      statusHistory: [
        entry('APPLICATION_RECEIVED', 90, 'Application received.', now),
        entry('UNDER_REVIEW', 60, null, now),
        entry('FORWARDED', 30, 'Forwarded to the district level committee.', now),
      ],
    }),

    // ---- More demo claims (owned by Farmer Two) so the government dashboard has realistic variety:
    //      a second Madhya Pradesh district (Mandla) and another Balaghat claim, for district-level scope tests.
    base({
      claimId: 'FRA-MP-2025-DEMO07', farmer: farmerTwoId, claimType: 'IFR', status: 'PENDING', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant Three', village: 'Demo Gram Four' },
      location: { state: 'Madhya Pradesh', district: 'Mandla', tehsil: 'Demo Tehsil Two', village: 'Demo Gram Four', gramPanchayat: 'Demo Panchayat Four', claimedAreaHectares: 1.2 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha Four', subDivisionalCommittee: 'Demo SDLC Four (Illustrative)', districtCommittee: 'Demo DLC Four (Illustrative)' },
      geometry: { type: 'Polygon', coordinates: patch(80.38, 22.6) },
      submittedAt: new Date(now - 25 * DAY),
      statusHistory: [entry('APPLICATION_RECEIVED', 25, 'Application received.', now), entry('PENDING', 8, 'Documents are being checked.', now)],
    }),
    base({
      claimId: 'FRA-MP-2025-DEMO08', farmer: farmerTwoId, claimType: 'IFR', status: 'UNDER_REVIEW', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant Four', village: 'Demo Gram Five' },
      location: { state: 'Madhya Pradesh', district: 'Mandla', tehsil: 'Demo Tehsil Two', village: 'Demo Gram Five', gramPanchayat: 'Demo Panchayat Five', claimedAreaHectares: 2.0 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha Five', subDivisionalCommittee: 'Demo SDLC Four (Illustrative)', districtCommittee: 'Demo DLC Four (Illustrative)' },
      geometry: undefined,
      submittedAt: new Date(now - 75 * DAY),
      statusHistory: [
        entry('APPLICATION_RECEIVED', 75, 'Application received.', now),
        entry('PENDING', 60, null, now),
        entry('UNDER_REVIEW', 5, 'Claim is being reviewed by the committee.', now),
      ],
    }),
    base({
      claimId: 'FRA-MP-2025-DEMO09', farmer: farmerTwoId, claimType: 'CR', status: 'FORWARDED', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant Five', village: 'Demo Gram One' },
      location: { state: 'Madhya Pradesh', district: 'Balaghat', tehsil: 'Demo Tehsil', village: 'Demo Gram One', gramPanchayat: 'Demo Panchayat', claimedAreaHectares: 4.5 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha One', subDivisionalCommittee: 'Demo SDLC (Illustrative)', districtCommittee: 'Demo DLC (Illustrative)' },
      geometry: { type: 'Polygon', coordinates: patch(80.21, 21.78) },
      submittedAt: new Date(now - 120 * DAY),
      statusHistory: [
        entry('APPLICATION_RECEIVED', 120, 'Application received.', now),
        entry('UNDER_REVIEW', 90, null, now),
        entry('FORWARDED', 2, 'Forwarded to the district level committee.', now),
      ],
    }),
    base({
      claimId: 'FRA-MP-2024-DEMO10', farmer: farmerTwoId, claimType: 'IFR', status: 'APPROVED', rejectionReason: null,
      applicant: { fullName: 'Demo Applicant Six', village: 'Demo Gram Four' },
      location: { state: 'Madhya Pradesh', district: 'Mandla', tehsil: 'Demo Tehsil Two', village: 'Demo Gram Four', gramPanchayat: 'Demo Panchayat Four', claimedAreaHectares: 0.8 },
      jurisdiction: { gramSabha: 'Demo Gram Sabha Four', subDivisionalCommittee: 'Demo SDLC Four (Illustrative)', districtCommittee: 'Demo DLC Four (Illustrative)' },
      geometry: { type: 'Polygon', coordinates: patch(80.45, 22.55) },
      submittedAt: new Date(now - 500 * DAY),
      statusHistory: [
        entry('APPLICATION_RECEIVED', 500, 'Application received.', now),
        entry('UNDER_REVIEW', 430, null, now),
        entry('FORWARDED', 350, null, now),
        entry('APPROVED', 6, 'Claim approved.', now),
      ],
    }),
  ];
};
