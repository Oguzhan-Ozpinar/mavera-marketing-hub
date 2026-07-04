import { describe, it, expect } from "vitest";
import { can, mapDirectusRole } from "./rbac.js";

describe("can (RBAC)", () => {
  it("admin her şeyi yapar", () => {
    expect(can("admin", "campaigns.send")).toBe(true);
    expect(can("admin", "blacklist.write")).toBe(true);
  });
  it("marketer kampanya gönderir, okuyucu gönderemez", () => {
    expect(can("marketer", "campaigns.send")).toBe(true);
    expect(can("viewer", "campaigns.send")).toBe(false);
  });
  it("viewer sadece okur", () => {
    expect(can("viewer", "contacts.read")).toBe(true);
    expect(can("viewer", "contacts.write")).toBe(false);
  });
});

describe("mapDirectusRole", () => {
  it("Directus rol adını uygulama rolüne çevirir", () => {
    expect(mapDirectusRole("Administrator")).toBe("admin");
    expect(mapDirectusRole("Pazarlama Ekibi")).toBe("marketer");
    expect(mapDirectusRole("Marketing")).toBe("marketer");
    expect(mapDirectusRole("Okuyucu")).toBe("viewer");
    expect(mapDirectusRole(null)).toBe("viewer");
  });
});
