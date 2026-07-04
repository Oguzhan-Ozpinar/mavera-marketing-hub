export interface FieldMeta {
  field: string;
  label: string;
  type: "number" | "text" | "date" | "boolean";
  ops: string[];
  suggestions?: string[];
}

export interface Rule {
  field: string;
  op: string;
  value: string;
}

export const OP_LABEL: Record<string, string> = {
  _eq: "eşittir",
  _neq: "eşit değildir",
  _gt: "büyüktür",
  _gte: "büyük/eşittir",
  _lt: "küçüktür",
  _lte: "küçük/eşittir",
  _contains: "içerir",
};

function coerce(value: string, type: FieldMeta["type"]): unknown {
  if (type === "number") return Number(value);
  if (type === "boolean") return value === "true";
  return value; // text, date (ISO)
}

/** Görsel kuralları Directus filtre nesnesine çevir (arka planda; marketingci görmez). */
export function buildFilter(rules: Rule[], fields: FieldMeta[]): Record<string, unknown> {
  const valid = rules.filter((r) => r.field && r.op && r.value !== "");
  if (valid.length === 0) return {};
  const and = valid.map((r) => {
    const meta = fields.find((f) => f.field === r.field);
    return { [r.field]: { [r.op]: coerce(r.value, meta?.type ?? "text") } };
  });
  return { _and: and };
}

/** Kuralları otomasyon koşul dizisine çevir (tip'e göre değer coerce edilir). */
export function rulesToConditions(rules: Rule[], fields: FieldMeta[]) {
  return rules
    .filter((r) => r.field && r.op && r.value !== "")
    .map((r) => {
      const meta = fields.find((f) => f.field === r.field);
      return { field: r.field, op: r.op, value: coerce(r.value, meta?.type ?? "text") };
    });
}

/** Koşul dizisini (kayıtlı) görsel kurallara geri çevir (düzenleme için). */
export function conditionsToRules(conditions: any[] | null | undefined): Rule[] {
  if (!Array.isArray(conditions)) return [];
  return conditions.map((c) => ({ field: c.field, op: c.op, value: String(c.value ?? "") }));
}
