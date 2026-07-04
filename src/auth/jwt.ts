/**
 * Middleware'in kendi JWT'si — kullanıcıya verilen "dijital kimlik kartı".
 * İçinde: kullanıcı id, dernek, rol. HS256 ile JWT_SECRET kullanılarak imzalanır.
 */
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";
import type { AppRole } from "./rbac.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AuthUser {
  sub: string; // Directus user id
  email: string;
  dernek: string; // dernekId
  role: AppRole;
}

export async function signToken(user: AuthUser, ttl = "12h"): Promise<string> {
  return new SignJWT({ email: user.email, dernek: user.dernek, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: String(payload.sub),
    email: String(payload.email ?? ""),
    dernek: String(payload.dernek ?? ""),
    role: payload.role as AppRole,
  };
}
