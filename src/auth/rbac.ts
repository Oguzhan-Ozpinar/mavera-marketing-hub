/**
 * RBAC — rol → yetki matrisi. "Ne yapmaya iznin var?"
 */
export type AppRole = "admin" | "marketer" | "viewer";

export type Permission =
  | "contacts.read"
  | "contacts.write"
  | "campaigns.read"
  | "campaigns.create"
  | "campaigns.send"
  | "segments.read"
  | "segments.write"
  | "consent.read"
  | "blacklist.read"
  | "blacklist.write"
  | "automation.read"
  | "automation.write"
  | "settings.read"
  | "settings.write"
  | "admin.all";

const MATRIX: Record<AppRole, Permission[]> = {
  admin: ["admin.all"], // admin.all = her şey (aşağıda özel geçilir)
  marketer: [
    "contacts.read",
    "contacts.write",
    "campaigns.read",
    "campaigns.create",
    "campaigns.send",
    "segments.read",
    "segments.write",
    "consent.read",
    "blacklist.read",
    "blacklist.write",
    "automation.read",
    "automation.write",
  ],
  viewer: ["contacts.read", "campaigns.read", "segments.read", "consent.read", "blacklist.read", "automation.read"],
};

export function can(role: AppRole, perm: Permission): boolean {
  if (role === "admin") return true; // admin her şeyi yapar
  return MATRIX[role]?.includes(perm) ?? false;
}

/** Directus rol adı → uygulama rolü. Basit eşleme; ileride registry'den override edilebilir. */
export function mapDirectusRole(roleName: string | null | undefined): AppRole {
  const n = (roleName ?? "").toLowerCase();
  if (n.includes("admin")) return "admin";
  if (n.includes("pazarlama") || n.includes("marketer") || n.includes("marketing")) return "marketer";
  return "viewer";
}
