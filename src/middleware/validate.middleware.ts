import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { sendError } from '../utils/response';

export const validate =
  (schema: Joi.ObjectSchema, target: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join(', ');
      sendError(res, `Validation error: ${details}`, 422);
      return;
    }

    req[target] = value;
    next();
  };