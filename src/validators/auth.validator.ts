import Joi from 'joi';

export const signupSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),
  name: Joi.string().min(2).max(100).trim().required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

export const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
});

export const verifyOtpSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'string.length': 'OTP must be exactly 6 digits',
    'string.pattern.base': 'OTP must contain only digits',
  }),
});

export const resetPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),
});
