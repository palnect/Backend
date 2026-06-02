import Joi from 'joi';

const LEARNER_TYPES = ['pupil', 'high_school', 'undergraduate', 'msc', 'phd', 'professional', 'self_learner', 'other'];
const LEARNING_STYLES = ['visual', 'auditory', 'kinesthetic', 'reading'];
const TUTORING_MODES = ['explain', 'quiz', 'simplify', 'motivate', 'practice', 'review'];

export const createSessionSchema = Joi.object({
  topic: Joi.string().min(1).max(500).trim().required(),
  mode: Joi.string().valid(...TUTORING_MODES).default('explain'),
  sourceContext: Joi.string().max(50000).optional().allow(''),
});

export const endSessionSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
});

export const onboardingSchema = Joi.object({
  learnerType: Joi.string().valid(...LEARNER_TYPES).required(),
  field: Joi.string().min(1).max(200).trim().required(),
  learningStyle: Joi.string().valid(...LEARNING_STYLES).required(),
  goals: Joi.array().items(Joi.string()).min(1).max(10).required(),
  availableHoursPerDay: Joi.number().min(0.5).max(16).required(),
});

export const updateProfileSchema = Joi.object({
  field: Joi.string().min(1).max(200).trim(),
  learning_style: Joi.string().valid(...LEARNING_STYLES),
  goals: Joi.array().items(Joi.string()).min(1).max(10),
  learner_type: Joi.string().valid(...LEARNER_TYPES),
  available_hours_per_day: Joi.number().min(0.5).max(16),
}).min(1);

export const createGoalSchema = Joi.object({
  title: Joi.string().min(1).max(300).trim().required(),
  field: Joi.string().max(200).trim().optional().allow(''),
  scheduled_date: Joi.string().isoDate().optional(),
});

export const updateGoalSchema = Joi.object({
  title: Joi.string().min(1).max(300).trim(),
  completed_at: Joi.string().isoDate().allow(null),
  linked_session_id: Joi.string().uuid().allow(null),
  scheduled_date: Joi.string().isoDate().allow(null),
}).min(1);
