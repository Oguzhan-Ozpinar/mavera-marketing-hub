/**
 * Netgsm SMS istemcisi (REST v2).
 * POST https://api.netgsm.com.tr/sms/rest/v2/send · HTTP Basic auth · encoding TR · iysfilter.
 * Kaynak: api docs/API_...Netgsm.md
 */
import { normalizePhone } from "../../lib/phone.js";
import type { DernekContext } from "../../dernek/dernek.context.js";

export async function sendSmsNetgsm(
  ctx: DernekContext,
  opts: { to: string; message: string; iysfilter?: "0" | "11" | "12" },
): Promise<string> {
  const c = ctx.config.netgsm;
  if (!c) throw new Error("Netgsm yapılandırılmamış");
  if (!opts.message) throw new Error("SMS mesajı boş");

  const auth = Buffer.from(`${c.user}:${c.pass}`).toString("base64");
  const no = normalizePhone(opts.to).last10 ?? opts.to.replace(/\D/g, "");

  const res = await fetch("https://api.netgsm.com.tr/sms/rest/v2/send", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      msgheader: c.msgheader,
      encoding: "TR",
      iysfilter: opts.iysfilter ?? "11", // pazarlama = 11 (İYS marka kodu Netgsm panelinde tanımlı olmalı)
      messages: [{ msg: opts.message, no }],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { jobid?: string; code?: string; description?: string };
  if (json.jobid) return String(json.jobid);
  throw new Error(json.description ?? `Netgsm hata (code ${json.code ?? res.status})`);
}
