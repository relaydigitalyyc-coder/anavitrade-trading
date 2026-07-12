import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { getEnv, type Env } from "./_core/env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

function getSessionSecret(): Uint8Array {
  const secret = getEnv().JWT_SECRET;
  return new TextEncoder().encode(secret);
}

function parseCookies(cookieHeader: string | null): Map<string, string> {
  if (!cookieHeader) return new Map();
  const map = new Map<string, string>();
  for (const pair of cookieHeader.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

export async function createSessionToken(
  openId: string,
  options: { expiresInMs?: number; name?: string } = {}
): Promise<string> {
  const env = getEnv();
  return signSession(
    { openId, appId: env.VITE_APP_ID, name: options.name || "" },
    options
  );
}

export async function signSession(
  payload: SessionPayload,
  options: { expiresInMs?: number } = {}
): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = options.expiresInMs ?? 30 * 24 * 60 * 60 * 1000; // 30 days
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
  const secretKey = getSessionSecret();

  return new SignJWT({
    openId: payload.openId,
    appId: payload.appId,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export async function verifySession(
  cookieValue: string | undefined | null
): Promise<SessionPayload | null> {
  if (!cookieValue) return null;
  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(cookieValue, secretKey, {
      algorithms: ["HS256"],
    });
    const { openId, appId, name } = payload as Record<string, unknown>;
    if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
      return null;
    }
    return { openId, appId, name };
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request, env: Env): Promise<User> {
  // Prefer session cookie
  const cookies = parseCookies(req.headers.get("cookie"));
  let sessionToken = cookies.get(COOKIE_NAME);

  // Fallback to Authorization header
  if (!sessionToken) {
    const authHeader = req.headers.get("authorization");
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7);
    }
  }

  const session = await verifySession(sessionToken as string | undefined);
  if (!session) {
    throw new ForbiddenError("Invalid session");
  }

  // Local email/password auth: openId is "local:{userId}"
  if (session.openId.startsWith("local:")) {
    const userId = parseInt(session.openId.slice(6), 10);
    if (isNaN(userId)) throw new ForbiddenError("Invalid local session");
    const user = await db.getUserById(userId);
    if (!user) throw new ForbiddenError("User not found");
    return user;
  }

  // OAuth: look up by openId
  const user = await db.getUserByOpenId(session.openId);
  if (!user) throw new ForbiddenError("User not found");
  return user;
}
