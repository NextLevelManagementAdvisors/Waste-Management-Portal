import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { isAllowedApiOrigin } from '../corsConfig';

function makeReq(overrides: Partial<Request> = {}): Request {
  const headers = new Map<string, string>();

  return {
    protocol: 'http',
    header(name: string) {
      return headers.get(name.toLowerCase());
    },
    ...overrides,
  } as Request;
}

describe('isAllowedApiOrigin', () => {
  it('allows requests without an Origin header in production', () => {
    const req = makeReq();
    expect(isAllowedApiOrigin(req, undefined, [], true)).toBe(true);
  });

  it('allows same-origin browser requests in production', () => {
    const req = makeReq({
      protocol: 'http',
      header(name: string) {
        if (name.toLowerCase() === 'host') return '127.0.0.1:5000';
        return undefined;
      },
    });

    expect(isAllowedApiOrigin(req, 'http://127.0.0.1:5000', [], true)).toBe(true);
  });

  it('allows configured cross-origin requests in production', () => {
    const req = makeReq({
      protocol: 'http',
      header(name: string) {
        if (name.toLowerCase() === 'host') return '127.0.0.1:5000';
        return undefined;
      },
    });

    expect(isAllowedApiOrigin(req, 'https://portal.example.com', ['https://portal.example.com'], true)).toBe(true);
  });

  it('rejects unknown cross-origin requests in production', () => {
    const req = makeReq({
      protocol: 'http',
      header(name: string) {
        if (name.toLowerCase() === 'host') return '127.0.0.1:5000';
        return undefined;
      },
    });

    expect(isAllowedApiOrigin(req, 'https://evil.example.com', ['https://portal.example.com'], true)).toBe(false);
  });

  it('respects forwarded host and proto when behind a proxy', () => {
    const req = makeReq({
      protocol: 'http',
      header(name: string) {
        const key = name.toLowerCase();
        if (key === 'host') return 'internal:5000';
        if (key === 'x-forwarded-host') return 'portal.example.com';
        if (key === 'x-forwarded-proto') return 'https';
        return undefined;
      },
    });

    expect(isAllowedApiOrigin(req, 'https://portal.example.com', [], true)).toBe(true);
  });
});
