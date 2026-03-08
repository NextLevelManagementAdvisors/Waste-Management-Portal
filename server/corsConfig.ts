import type { Request } from 'express';

function normalizeOrigin(origin?: string | null): string | null {
  if (!origin) return null;

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(req: Request): string | null {
  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.header('host');
  const protocol = forwardedProto || req.protocol;

  if (!host) return null;
  return `${protocol}://${host}`;
}

export function isAllowedApiOrigin(
  req: Request,
  origin: string | undefined,
  allowedOrigins: string[],
  isProduction: boolean,
): boolean {
  if (!isProduction) return true;
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  const requestOrigin = normalizeOrigin(getRequestOrigin(req));

  if (!normalizedOrigin) return false;
  if (requestOrigin && normalizedOrigin === requestOrigin) return true;

  const normalizedAllowedOrigins = allowedOrigins
    .map(item => normalizeOrigin(item))
    .filter((item): item is string => Boolean(item));

  return normalizedAllowedOrigins.includes(normalizedOrigin);
}
