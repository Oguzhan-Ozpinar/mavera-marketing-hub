import type { AuthUser } from "../auth/jwt.js";
import type { DernekContext } from "../dernek/dernek.context.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
    dernekContext?: DernekContext;
  }
}
