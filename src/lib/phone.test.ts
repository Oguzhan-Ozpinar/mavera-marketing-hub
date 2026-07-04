import { describe, it, expect } from "vitest";
import { normalizePhone, isSamePhone } from "./phone.js";

describe("normalizePhone", () => {
  const cases: Array<[string, string, string]> = [
    // [girdi, beklenen e164, beklenen last10]
    ["0532 123 45 67", "+905321234567", "5321234567"],
    ["+90 532 123 45 67", "+905321234567", "5321234567"],
    ["905321234567", "+905321234567", "5321234567"],
    ["5321234567", "+905321234567", "5321234567"],
    ["00905321234567", "+905321234567", "5321234567"],
    ["(0532) 123-45-67", "+905321234567", "5321234567"],
  ];

  it.each(cases)("%s → %s / %s", (input, e164, last10) => {
    const r = normalizePhone(input);
    expect(r.e164).toBe(e164);
    expect(r.last10).toBe(last10);
    expect(r.valid).toBe(true);
  });

  it("boş/geçersiz girdi", () => {
    expect(normalizePhone("").valid).toBe(false);
    expect(normalizePhone(null).e164).toBe(null);
    expect(normalizePhone("123").last10).toBe(null);
  });

  it("sabit hat / 5 ile başlamayan → valid=false ama last10 üretir", () => {
    const r = normalizePhone("02123334455");
    expect(r.valid).toBe(false);
    expect(r.last10).toBe("2123334455");
  });
});

describe("isSamePhone", () => {
  it("farklı formatlar aynı kişi", () => {
    expect(isSamePhone("0532 123 45 67", "+905321234567")).toBe(true);
  });
  it("farklı numaralar", () => {
    expect(isSamePhone("05321234567", "05321234568")).toBe(false);
  });
  it("null güvenli", () => {
    expect(isSamePhone(null, "05321234567")).toBe(false);
  });
});
