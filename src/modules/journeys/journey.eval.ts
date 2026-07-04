/**
 * Akış kuralı değerlendirme yardımcıları.
 */
export interface AppEvent {
  type: string; // contact_created | donation_created | return_status_changed | ...
  contactId: string;
  payload?: Record<string, any>;
}

export interface AutomationRule {
  id: string;
  is_active: boolean;
  trigger_type: string;
  trigger_params?: Record<string, any> | null;
  conditions?: Array<{ field: string; op: string; value: any }> | null;
  delay_value?: number | null;
  delay_unit?: string | null;
  action_type: string;
  action_params?: Record<string, any> | null;
  recheck_on_fire?: boolean | null;
}

/** Tetikleyici eşleşiyor mu? */
export function matchesTrigger(rule: AutomationRule, event: AppEvent): boolean {
  const p = rule.trigger_params ?? {};
  switch (rule.trigger_type) {
    case "contact_created":
      return event.type === "contact_created";
    case "donation_created":
      return event.type === "donation_created";
    case "donation_type":
      return event.type === "donation_created" && p.donation_type === event.payload?.donation_type;
    case "return_status_changed":
      return (
        event.type === "return_status_changed" &&
        (p.return_status == null || p.return_status === event.payload?.return_status)
      );
    default:
      return rule.trigger_type === event.type;
  }
}

/** Koşulları kontakt kaydına göre değerlendir (hepsi doğru olmalı). */
export function evalConditions(
  conditions: AutomationRule["conditions"],
  contact: Record<string, any>,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => {
    const actual = contact[c.field];
    switch (c.op) {
      case "_eq":
        return actual === c.value;
      case "_neq":
        return actual !== c.value;
      case "_gt":
        return Number(actual) > Number(c.value);
      case "_gte":
        return Number(actual) >= Number(c.value);
      case "_lt":
        return Number(actual) < Number(c.value);
      case "_lte":
        return Number(actual) <= Number(c.value);
      case "_contains":
        return String(actual ?? "").includes(String(c.value));
      default:
        return false;
    }
  });
}

const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
  months: 2_592_000_000, // ~30 gün
};

export function delayToMs(value: number | null | undefined, unit: string | null | undefined): number {
  const v = value ?? 0;
  const u = UNIT_MS[unit ?? "minutes"] ?? 60_000;
  return Math.max(0, v * u);
}
