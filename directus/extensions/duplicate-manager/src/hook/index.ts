import { defineHook } from "@directus/extensions-sdk";
import { scanSingleContact } from "../shared/engine";

export default defineHook(({ filter, action }, { logger }) => {
  filter("Contacts.items.query", (query: any) => {
    if (hasMergedFilter(query?.filter)) return query;

    const activeOnly = {
      _or: [
        { is_merged: { _null: true } },
        { is_merged: { _eq: false } },
      ],
    };

    return {
      ...(query ?? {}),
      filter: query?.filter ? { _and: [query.filter, activeOnly] } : activeOnly,
    };
  });

  action("Contacts.items.create", async (meta: any, context: any) => {
    const contactId = String(meta.key ?? "");
    if (!contactId) return;
    try {
      await scanSingleContact(context.database, contactId, { limit: 1000 });
    } catch (error) {
      logger.warn(error, "duplicate scan hook failed after Contacts create");
    }
  });

  action("Contacts.items.update", async (meta: any, context: any) => {
    const keys = Array.isArray(meta.keys) ? meta.keys : [meta.key].filter(Boolean);
    for (const key of keys) {
      try {
        await scanSingleContact(context.database, String(key), { limit: 1000 });
      } catch (error) {
        logger.warn(error, "duplicate scan hook failed after Contacts update");
      }
    }
  });
});

function hasMergedFilter(filter: unknown): boolean {
  if (!filter || typeof filter !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(filter, "is_merged")) return true;
  return Object.values(filter as Record<string, unknown>).some((value) => {
    if (Array.isArray(value)) return value.some(hasMergedFilter);
    return hasMergedFilter(value);
  });
}
