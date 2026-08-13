import pino, { type Logger, type LoggerOptions } from 'pino';
import { env } from '../../config/env';

/** JSON in production, pretty in development; `console.log` is never used — no levels, no redaction. */

const options: LoggerOptions = {
  level: env.logLevel,
  base: { service: 'appointly-api', env: env.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Defence in depth: even if a caller logs a whole request body, secrets never reach the sink.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'token',
      '*.token',
      'refreshToken',
      '*.refreshToken',
      'apiKey',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
};

export const logger: Logger = env.isProduction
  ? pino(options)
  : pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service,env' },
      },
    });

/** Creates a child logger whose entries all carry `{ module }`. */
export function createLogger(module: string): Logger {
  return logger.child({ module });
}
