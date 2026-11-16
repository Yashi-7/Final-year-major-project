import mongoose from 'mongoose';
import { WORKFLOW_ACTION_NAMES } from '../utils/claimWorkflow.js';
import {
  CLAIM_ID_PATTERN,
  CLAIM_STATUSES,
  CLAIM_TYPES,
  DATA_SOURCES,
  checkClaimConsistency,
  validateGeoJsonGeometry,
} from '../utils/fraClaimRules.js';

/**
 * Forest Rights Act (FRA) claim.
 *
 * Ownership: `farmer` is set by the authorized registration process (Gram Sarpanch / registration desk),
 * never by the farmer and never from a request body. Farmer-facing code must always query with BOTH the
 * claim reference ID and `farmer: req.user._id` (see repositories/claimRepository.js).
 *
 * Data source: `dataSource` is required and has NO default on purpose, so demo data cannot be created
 * without saying so (and official data cannot be mislabelled by accident).
 */

// One entry per status change: the claim's audit trail (append-only; entries are only ever added by the
// workflow, in the SAME atomic update that changes `status`).
//   Farmer-visible:  status, changedAt, publicNote.
//   Officials only:  previousStatus, action, remarks (internal), rejectionReason, changedBy.
// The farmer view (services/fraClaimView.js) copies only the farmer-visible fields.
const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: CLAIM_STATUSES, required: true },
    previousStatus: { type: String, enum: [...CLAIM_STATUSES, null], default: null },
    action: { type: String, enum: [...WORKFLOW_ACTION_NAMES, null], default: null },
    remarks: { type: String, trim: true, maxlength: 1000, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 1000, default: null },
    changedAt: { type: Date, required: true, default: Date.now },
    publicNote: { type: String, trim: true, maxlength: 500, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

// GeoJSON Polygon / MultiPolygon. Coordinates are [longitude, latitude]. (`type` needs the nested form.)
const geometrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Polygon', 'MultiPolygon'], required: true },
    coordinates: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const claimSchema = new mongoose.Schema(
  {
    claimId: {
      type: String,
      required: [true, 'Claim reference ID is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [CLAIM_ID_PATTERN, 'Claim reference ID must look like FRA-MP-2025-A7K2QX'],
    },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Applicant details that are allowed to be shown back to the farmer. Deliberately minimal:
    // no phone, no government ID numbers.
    applicant: {
      fullName: { type: String, required: true, trim: true, maxlength: 100 },
      village: { type: String, trim: true, maxlength: 100 },
    },

    claimType: { type: String, enum: CLAIM_TYPES, required: true },

    location: {
      state: { type: String, trim: true, maxlength: 100 },
      district: { type: String, required: true, trim: true, maxlength: 100 },
      tehsil: { type: String, trim: true, maxlength: 100 },
      village: { type: String, trim: true, maxlength: 100 },
      gramPanchayat: { type: String, trim: true, maxlength: 100 },
      claimedAreaHectares: { type: Number, min: 0 },
    },

    // Committees the claim moves through (used by the future government workflow).
    jurisdiction: {
      gramSabha: { type: String, trim: true, maxlength: 150 },
      subDivisionalCommittee: { type: String, trim: true, maxlength: 150 },
      districtCommittee: { type: String, trim: true, maxlength: 150 },
    },

    geometry: {
      type: geometrySchema,
      default: undefined,
      validate: {
        validator: (g) => {
          if (g == null) return true;
          const plain = typeof g.toObject === 'function' ? g.toObject() : g;
          return validateGeoJsonGeometry(plain).valid;
        },
        message: 'geometry must be a valid GeoJSON Polygon or MultiPolygon',
      },
    },

    status: { type: String, enum: CLAIM_STATUSES, required: true, default: 'APPLICATION_RECEIVED' },
    rejectionReason: { type: String, trim: true, maxlength: 1000, default: null },
    statusHistory: { type: [statusHistorySchema], default: [] },

    submittedAt: { type: Date, required: true, default: Date.now },

    dataSource: { type: String, enum: DATA_SOURCES, required: true },
  },
  { timestamps: true }
);

claimSchema.index({ farmer: 1, claimId: 1 });
claimSchema.index({ 'location.district': 1, status: 1 }); // for the future government workflow
claimSchema.index({ geometry: '2dsphere' }); // for the future GIS features; documents without geometry are skipped

// Cross-field rules (status matches history, rejection reason only when REJECTED, ...).
claimSchema.pre('validate', function checkConsistency(next) {
  const problems = checkClaimConsistency(this);
  if (problems.length > 0) return next(new Error(`Invalid claim: ${problems.join('; ')}`));
  return next();
});

const Claim = mongoose.models.Claim || mongoose.model('Claim', claimSchema);

export default Claim;
