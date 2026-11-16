import User from '../models/User.js';
import generateToken, { setTokenCookie, clearTokenCookie } from '../utils/generateToken.js';

export const register = async (req, res, next) => {
  try {
    const { fullName, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const user = await User.create({ fullName, email, password, role });

    const token = generateToken({ id: user._id, role: user.role });
    setTokenCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: user.toSafeObject(),
    });
  } catch (error) {
    return next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = generateToken({ id: user._id, role: user.role });
    setTokenCookie(res, token);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: user.toSafeObject(),
    });
  } catch (error) {
    return next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    clearTokenCookie(res);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    return next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    return res.status(200).json({ success: true, user: req.user.toSafeObject() });
  } catch (error) {
    return next(error);
  }
};

// Only fullName is editable. Email and role are identity/permission fields and
// password changes need their own flow, so anything else in the body is ignored.
export const updateMe = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { fullName: req.body.fullName },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated',
      user: user.toSafeObject(),
    });
  } catch (error) {
    return next(error);
  }
};
