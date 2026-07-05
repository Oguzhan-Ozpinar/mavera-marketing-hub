import { defineEndpoint } from "@directus/extensions-sdk";
import {
  getMergePreview,
  listCandidates,
  mergeCandidate,
  rejectCandidate,
  scanAllContacts,
  scanSingleContact,
} from "../shared/engine";

export default defineEndpoint({
  id: "duplicate-manager",
  handler: (router, { database, logger }) => {
    router.get("/candidates", async (req: any, res: any, next: any) => {
      try {
        if (!isAuthenticated(req)) return res.status(401).send({ error: "Oturum gerekli" });
        const status = String(req.query.status ?? "pending");
        const limit = Number(req.query.limit ?? 100);
        const candidates = await listCandidates(database, status, limit);
        res.send({ candidates });
      } catch (error) {
        next(error);
      }
    });

    router.post("/scan", async (req: any, res: any, next: any) => {
      try {
        if (!isAuthenticated(req)) return res.status(401).send({ error: "Oturum gerekli" });
        const body = req.body ?? {};
        const contactId = body.contactId ? String(body.contactId) : null;
        const result = contactId
          ? await scanSingleContact(database, contactId, body)
          : await scanAllContacts(database, body);
        res.send({ ok: true, ...result });
      } catch (error) {
        logger.warn(error, "duplicate scan failed");
        next(error);
      }
    });

    router.post("/:id/reject", async (req: any, res: any, next: any) => {
      try {
        if (!isAuthenticated(req)) return res.status(401).send({ error: "Oturum gerekli" });
        const candidate = await rejectCandidate(database, Number(req.params.id), userId(req));
        if (!candidate) return res.status(404).send({ error: "Dublon adayi bulunamadi" });
        res.send({ ok: true, candidate });
      } catch (error) {
        next(error);
      }
    });

    router.post("/:id/preview", async (req: any, res: any, next: any) => {
      try {
        if (!isAuthenticated(req)) return res.status(401).send({ error: "Oturum gerekli" });
        const body = req.body ?? {};
        const preview = await getMergePreview(
          database,
          Number(req.params.id),
          body.masterId ? String(body.masterId) : undefined,
          body.fieldValues ?? {},
        );
        if (!preview) return res.status(404).send({ error: "Merge onizlemesi olusturulamadi" });
        res.send(preview);
      } catch (error) {
        next(error);
      }
    });

    router.post("/:id/merge", async (req: any, res: any, next: any) => {
      try {
        if (!isAuthenticated(req)) return res.status(401).send({ error: "Oturum gerekli" });
        const body = req.body ?? {};
        const result = await mergeCandidate(
          database,
          Number(req.params.id),
          userId(req),
          body.masterId ? String(body.masterId) : undefined,
          body.fieldValues ?? {},
        );
        if (!result) return res.status(404).send({ error: "Merge islemi yapilamadi" });
        res.send({ ok: true, ...result });
      } catch (error) {
        logger.warn(error, "duplicate merge failed");
        next(error);
      }
    });
  },
});

function isAuthenticated(req: any): boolean {
  return Boolean(req.accountability?.user || req.accountability?.admin);
}

function userId(req: any): string | null {
  return req.accountability?.user ? String(req.accountability.user) : null;
}
