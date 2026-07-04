import { describe, it, expect } from "vitest";
import { matchesTrigger, evalConditions, delayToMs, type AutomationRule } from "./journey.eval.js";

const rule = (over: Partial<AutomationRule>): AutomationRule => ({
  id: "r1",
  is_active: true,
  trigger_type: "contact_created",
  action_type: "whatsapp",
  ...over,
});

describe("matchesTrigger", () => {
  it("contact_created eşleşir", () => {
    expect(matchesTrigger(rule({}), { type: "contact_created", contactId: "c1" })).toBe(true);
    expect(matchesTrigger(rule({}), { type: "donation_created", contactId: "c1" })).toBe(false);
  });
  it("donation_type param eşleşmesi", () => {
    const r = rule({ trigger_type: "donation_type", trigger_params: { donation_type: "sukur_kurbani" } });
    expect(matchesTrigger(r, { type: "donation_created", contactId: "c1", payload: { donation_type: "sukur_kurbani" } })).toBe(true);
    expect(matchesTrigger(r, { type: "donation_created", contactId: "c1", payload: { donation_type: "genel" } })).toBe(false);
  });
});

describe("evalConditions", () => {
  it("koşul yoksa true", () => {
    expect(evalConditions(null, {})).toBe(true);
    expect(evalConditions([], {})).toBe(true);
  });
  it("_gte ve _eq birlikte", () => {
    const c = [
      { field: "donation_total", op: "_gte", value: 500 },
      { field: "ulke", op: "_eq", value: "Türkiye" },
    ];
    expect(evalConditions(c, { donation_total: 600, ulke: "Türkiye" })).toBe(true);
    expect(evalConditions(c, { donation_total: 400, ulke: "Türkiye" })).toBe(false);
    expect(evalConditions(c, { donation_total: 600, ulke: "Almanya" })).toBe(false);
  });
});

describe("delayToMs", () => {
  it("birim çevrimi", () => {
    expect(delayToMs(2, "weeks")).toBe(2 * 604_800_000);
    expect(delayToMs(3, "days")).toBe(3 * 86_400_000);
    expect(delayToMs(0, "minutes")).toBe(0);
    expect(delayToMs(5, undefined)).toBe(5 * 60_000);
  });
});
