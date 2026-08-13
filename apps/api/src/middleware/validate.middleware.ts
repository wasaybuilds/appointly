import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import type { ApiFieldIssue } from '@appointly/shared';
import { errors } from '../lib/errors/app-error';

// Parsed output lands on `req.validated` because Express 5 makes `req.query` getter-only.

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export interface ValidatedRequestData<TBody, TQuery, TParams> {
  body: TBody;
  query: TQuery;
  params: TParams;
}

/** Validates body/query/params, reporting every field issue in a single 422 rather than one per attempt. */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: ApiFieldIssue[] = [];
    const validated: Record<string, unknown> = {
      body: req.body,
      query: req.query,
      params: req.params,
    };

    for (const part of ['body', 'query', 'params'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);

      if (result.success) {
        validated[part] = result.data;
        continue;
      }

      for (const issue of result.error.issues) {
        issues.push({
          // `path` is empty when the failure is on the root value itself.
          path: issue.path.length > 0 ? issue.path.join('.') : part,
          message: issue.message,
        });
      }
    }

    if (issues.length > 0) {
      next(errors.validation(issues));
      return;
    }

    req.validated = validated as unknown as ValidatedRequestData<unknown, unknown, unknown>;

    // Keeps plain-Express handlers seeing coerced, trimmed values rather than the raw payload.
    req.body = validated.body;

    next();
  };
}

/** Single place where {@link validate}'s runtime guarantee is expressed as a cast, instead of once per controller. */
export function getValidated<TBody = unknown, TQuery = unknown, TParams = unknown>(
  req: Request,
): ValidatedRequestData<TBody, TQuery, TParams> {
  return req.validated as ValidatedRequestData<TBody, TQuery, TParams>;
}
