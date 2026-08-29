const VALID_NODE_ENVS = new Set(['development', 'test', 'production']);

function parseInteger(
  value: unknown,
  key: string,
  { min, max }: { min: number; max: number },
): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

export function parseCorsOrigins(value: unknown): string[] {
  if (value === undefined || value === '') {
    return [];
  }

  if (typeof value !== 'string') {
    throw new Error(
      'CORS_ORIGINS must be a comma-separated string of origins.',
    );
  }

  return value.split(',').map((origin) => {
    const normalized = origin.trim();
    const url = new URL(normalized);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== normalized
    ) {
      throw new Error(
        `CORS_ORIGINS contains an invalid origin: ${normalized}. Use a scheme and host only.`,
      );
    }

    return normalized;
  });
}

export function validateEnvironment(config: Record<string, unknown>) {
  const nodeEnv = String(config.NODE_ENV ?? 'development');
  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const databaseUrl = config.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required.');
  }

  let databaseProtocol: string;
  try {
    databaseProtocol = new URL(databaseUrl).protocol;
  } catch {
    throw new Error('DATABASE_URL must be a valid URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(databaseProtocol)) {
    throw new Error('DATABASE_URL must use the postgresql protocol.');
  }

  const corsOrigins = parseCorsOrigins(config.CORS_ORIGINS);
  const trustProxy = String(config.TRUST_PROXY ?? 'false');
  if (!['false', 'loopback'].includes(trustProxy)) {
    throw new Error('TRUST_PROXY must be false or loopback.');
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: parseInteger(config.PORT ?? 3000, 'PORT', { min: 1, max: 65535 }),
    APP_HOST: String(config.APP_HOST ?? '127.0.0.1'),
    CORS_ORIGINS: corsOrigins.join(','),
    TRUST_PROXY: trustProxy,
    THROTTLE_TTL_MS: parseInteger(
      config.THROTTLE_TTL_MS ?? 60000,
      'THROTTLE_TTL_MS',
      { min: 1000, max: 3_600_000 },
    ),
    THROTTLE_LIMIT: parseInteger(
      config.THROTTLE_LIMIT ?? 120,
      'THROTTLE_LIMIT',
      {
        min: 1,
        max: 10_000,
      },
    ),
  };
}
