/**
 * Auth katmanı — dört bekçi burada birleşir:
 *   1) /auth/login → kullanıcıyı KENDİ derneğinin Directus'una doğrular, bizim JWT'yi verir (Auth)
 *   2) onRequest hook → token doğrular, req.user + dernek bağlamını iliştirir (Auth + Dernek-guard)
 *   3) requirePermission → rol yetkisini kontrol eder (RBAC)
 *   4) requireDernekParam → path'teki :dernek kullanıcının derneğiyle aynı mı (Dernek-guard)
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getDernek, hasDernek } from "../config/derneks.js";
import { getDernekContext } from "../dernek/dernek.context.js";
import { signToken, verifyToken } from "./jwt.js";
import { can, mapDirectusRole, type Permission } from "./rbac.js";

const PUBLIC_PATHS = new Set(["/health", "/auth/login", "/derneks"]);

export async function registerAuth(app: FastifyInstance) {
  app.decorateRequest("user", undefined);
  app.decorateRequest("dernekContext", undefined);

  // --- Login ---
  app.post("/auth/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as { dernek?: string; email?: string; password?: string };
    const { dernek, email, password } = body;
    if (!dernek || !email || !password) {
      return reply.code(400).send({ error: "dernek, email, password zorunlu" });
    }
    if (!hasDernek(dernek)) {
      return reply.code(400).send({ error: `Bilinmeyen dernek: ${dernek}` });
    }

    const url = getDernek(dernek).directus.url;
    // 1) Kullanıcıyı derneğin Directus'una doğrula
    const loginRes = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
      return reply.code(401).send({ error: "Geçersiz kimlik bilgileri" });
    }
    const loginJson = (await loginRes.json()) as { data: { access_token: string } };
    const accessToken = loginJson.data.access_token;

    // 2) Kullanıcı bilgisi + rolü
    const meRes = await fetch(`${url}/users/me?fields=id,email,role.name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = (await meRes.json()) as { data: { id: string; email: string; role?: { name?: string } } };
    const role = mapDirectusRole(me.data.role?.name);

    // 3) Bizim JWT'yi ver
    const token = await signToken({ sub: me.data.id, email: me.data.email, dernek, role });
    return { token, user: { email: me.data.email, dernek, role } };
  });

  // --- Her istekte: token doğrula + dernek-guard ---
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0] ?? "";
    // Webhook'lar JWT değil imza/secret ile doğrulanır → auth'tan muaf
    if (PUBLIC_PATHS.has(path) || path.startsWith("/webhooks/")) return;

    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Token gerekli" });
    }
    try {
      const user = await verifyToken(auth.slice(7));
      if (!user.dernek || !hasDernek(user.dernek)) {
        return reply.code(401).send({ error: "Geçersiz dernek" });
      }
      req.user = user;
      req.dernekContext = getDernekContext(user.dernek); // Dernek-guard: sadece kendi derneği
    } catch {
      return reply.code(401).send({ error: "Geçersiz/süresi dolmuş token" });
    }
  });
}

/** RBAC preHandler: belirli yetki yoksa 403. */
export function requirePermission(perm: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: "Kimlik yok" });
    if (!can(req.user.role, perm)) {
      return reply.code(403).send({ error: `Yetkisiz: ${perm} gerekli` });
    }
  };
}

/** Dernek-guard: path'teki :dernek kullanıcının derneğiyle aynı olmalı. */
export function requireDernekParam(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  const params = req.params as { dernek?: string };
  if (params.dernek && params.dernek !== req.user?.dernek) {
    return reply.code(403).send({ error: "Başka derneğe erişim yasak" });
  }
  done();
}
