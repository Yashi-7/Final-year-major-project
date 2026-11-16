import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Exactly two roles exist in this system. No Admin role.
export const USER_ROLES = ['FARMER', 'GOVERNMENT_OFFICIAL'];

// One area of responsibility for a GOVERNMENT_OFFICIAL: a state, optionally narrowed to a district and a tehsil.
// (See utils/jurisdiction.js for how areas grant access. No areas = access to no claims.)
const areaSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true, maxlength: 100 },
    district: { type: String, trim: true, maxlength: 100, default: null },
    tehsil: { type: String, trim: true, maxlength: 100, default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never returned by default queries
    },
    role: {
      type: String,
      enum: {
        values: USER_ROLES,
        message: `Role must be one of: ${USER_ROLES.join(', ')}`,
      },
      required: [true, 'Role is required'],
    },
    // Only meaningful for GOVERNMENT_OFFICIAL. Never set from registration; assigned by an operator
    // (npm run assign-jurisdiction). Empty by default => the official sees no claims.
    jurisdiction: {
      areas: { type: [areaSchema], default: [] },
    },
  },
  { timestamps: true }
);

userSchema.pre('validate', function checkJurisdiction(next) {
  const areas = this.jurisdiction?.areas ?? [];
  if (areas.length > 0 && this.role !== 'GOVERNMENT_OFFICIAL') {
    return next(new Error('Only government officials can have a jurisdiction.'));
  }
  if (areas.some((a) => a.tehsil && !a.district)) return next(new Error('A tehsil requires a district.'));
  return next();
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Strips the password hash before sending user data to the client.
userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
  };
};

const User = mongoose.model('User', userSchema);

export default User;
