import express from 'express';
import { register, login, logout, getMe, updateMe } from '../controllers/authController.js';
import { registerValidator, loginValidator, updateProfileValidator } from '../validators/authValidators.js';
import validate from '../middleware/validate.js';
import authenticate from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', registerValidator, validate, register);
router.post('/login', loginValidator, validate, login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateProfileValidator, validate, updateMe);

export default router;
