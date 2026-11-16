import { validationResult } from 'express-validator';

/**
 * Runs after an express-validator chain. Returns 400 with field-level
 * error details if any validation rule failed; otherwise passes through.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return next();
};

export default validate;
