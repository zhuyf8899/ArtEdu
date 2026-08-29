import { describe, expect, it } from 'vitest';
import {
  parseCorsOrigins,
  validateEnvironment,
} from './environment.validation.js';

const baseConfig = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/design_platform',
};

describe('environment validation', () => {
  it('uses safe local defaults', () => {
    expect(validateEnvironment(baseConfig)).toMatchObject({
      APP_HOST: '127.0.0.1',
      PORT: 3000,
      THROTTLE_LIMIT: 120,
      THROTTLE_TTL_MS: 60000,
      TRUST_PROXY: 'false',
    });
  });

  it('rejects invalid database URLs and proxy settings', () => {
    expect(() =>
      validateEnvironment({ ...baseConfig, DATABASE_URL: 'mysql://x' }),
    ).toThrow('postgresql protocol');
    expect(() =>
      validateEnvironment({ ...baseConfig, TRUST_PROXY: 'true' }),
    ).toThrow('TRUST_PROXY');
  });

  it('accepts only full HTTP origins for CORS', () => {
    expect(
      parseCorsOrigins('https://app.example.edu.cn,http://localhost:3000'),
    ).toEqual(['https://app.example.edu.cn', 'http://localhost:3000']);
    expect(() => parseCorsOrigins('https://app.example.edu.cn/path')).toThrow(
      'invalid origin',
    );
  });
});
