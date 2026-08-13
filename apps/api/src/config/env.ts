import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Boot fails loudly on bad configuration: an undefined JWT secret that only surfaces
// at the first login is far more expensive to diagnose than a process that never starts.

loadDotenv();

const booleanFromString = z
  .string()
  .transform((value) => value === 'true' || value === '1')
  .pipe(z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_SSL: booleanFromString.default(true),
  /** Provider CA in PEM. Supplied: the chain is verified. Omitted: encrypted but unverified, like `sslmode=require`. */
  DATABASE_CA_CERT: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: booleanFromString.default(false),
  /** `none` is required across registrable domains in production, and forces Secure. */
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_MODEL: z.string().default('mistral-small-latest'),
  MISTRAL_BASE_URL: z.string().default('https://api.mistral.ai/v1'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(20_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),

  BUSINESS_TIMEZONE: z.string().default('UTC'),
  BUSINESS_OPEN_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  BUSINESS_CLOSE_HOUR: z.coerce.number().int().min(1).max(24).default(18),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_CHAT_MAX_REQUESTS: z.coerce.number().int().min(1).default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  // Straight to stderr: the logger depends on this module and does not exist yet.
  process.stderr.write(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const raw = parsed.data;

/** Namespaced, immutable view of the configuration, grouped by subsystem (`env.auth.accessTtl`). */
export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  logLevel: raw.LOG_LEVEL,

  database: {
    url: raw.DATABASE_URL,
    poolMax: raw.DATABASE_POOL_MAX,
    ssl: raw.DATABASE_SSL,
    caCert: raw.DATABASE_CA_CERT && raw.DATABASE_CA_CERT.length > 0 ? raw.DATABASE_CA_CERT : undefined,
  },

  auth: {
    accessSecret: raw.JWT_ACCESS_SECRET,
    refreshSecret: raw.JWT_REFRESH_SECRET,
    accessTtl: raw.JWT_ACCESS_TTL,
    refreshTtl: raw.JWT_REFRESH_TTL,
  },

  cookie: {
    domain: raw.COOKIE_DOMAIN && raw.COOKIE_DOMAIN.length > 0 ? raw.COOKIE_DOMAIN : undefined,
    secure: raw.COOKIE_SECURE || raw.COOKIE_SAME_SITE === 'none',
    sameSite: raw.COOKIE_SAME_SITE,
  },

  /** Comma-separated list so preview deployments can be allow-listed. */
  webOrigins: raw.WEB_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),

  ai: {
    apiKey: raw.MISTRAL_API_KEY,
    model: raw.MISTRAL_MODEL,
    baseUrl: raw.MISTRAL_BASE_URL.replace(/\/$/, ''),
    timeoutMs: raw.AI_REQUEST_TIMEOUT_MS,
    maxRetries: raw.AI_MAX_RETRIES,
    /** When false the assistant runs in deterministic fallback mode. */
    isConfigured: Boolean(raw.MISTRAL_API_KEY && raw.MISTRAL_API_KEY.length > 0),
  },

  business: {
    timezone: raw.BUSINESS_TIMEZONE,
    openHour: raw.BUSINESS_OPEN_HOUR,
    closeHour: raw.BUSINESS_CLOSE_HOUR,
  },

  rateLimit: {
    windowMs: raw.RATE_LIMIT_WINDOW_MS,
    max: raw.RATE_LIMIT_MAX_REQUESTS,
    authMax: raw.RATE_LIMIT_AUTH_MAX_REQUESTS,
    chatMax: raw.RATE_LIMIT_CHAT_MAX_REQUESTS,
  },
} as const;

export type Env = typeof env;
