import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const notFound = () => new HttpError(404, 'not_found', 'Not found');
export const forbidden = () => new HttpError(403, 'forbidden', 'You do not have access to this.');

// Wrap async handlers so thrown errors reach the error middleware.
export const h = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: 'invalid_input', message: 'Some fields are not valid.', issues: err.issues.map((i) => ({ path: i.path, message: i.message })) });
  if ((err as { code?: string })?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large', message: 'That file is larger than the upload limit.' });
  // Log only the error type and message. Never log request bodies or client content.
  console.error('[error]', (err as Error)?.name, (err as Error)?.message);
  return res.status(500).json({ error: 'server_error', message: 'Something went wrong on our side. Your saved work is safe.' });
}
