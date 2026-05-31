import Joi from 'joi';

export const createSessionSchema = Joi.object({
  subject: Joi.string().min(1).max(100).trim().required(),
  topic: Joi.string().min(1).max(200).trim().required(),
  mode: Joi.string()
    .valid('explain', 'quiz', 'simplify', 'motivate', 'practice', 'review')
    .default('explain'),
});

export const endSessionSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
});

export const onboardingSchema = Joi.object({
  subjects: Joi.array().items(Joi.string()).min(1).max(10).required(),
  level: Joi.string().valid('beginner', 'intermediate', 'advanced').required(),
  learningStyle: Joi.string()
    .valid('visual', 'auditory', 'kinesthetic', 'reading')
    .required(),
  goals: Joi.array().items(Joi.string()).min(1).max(10).required(),
  availableHoursPerWeek: Joi.number().min(1).max(40).required(),
});