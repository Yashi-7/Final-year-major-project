import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Verifies the JWT (from the httpOnly cookie, or an Authorization: Bearer header
 * as a fallback for non-browser clients), loads the user, and attaches it to req.user.
 * This is the server-side authentication boundary — frontend route hiding alone
 * is never trusted.
 */
const authenticate = async (req, res, next) => {
  try {
    const bearerHeader = req.headers.authorization;
    const bearerToken = bearerHeader?.startsWith('Bearer ') ? bearerHeader.split(' ')[1] : null;
    const token = req.cookies?.token || bearerToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User account no longer exists.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
  }
};

export default authenticate;
