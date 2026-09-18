import { z } from "zod";
import type { EventModule } from "@prisma/client";

/**
 * ETX-EVENT-001C — every value of the EventModule enum, in application
 * code (Prisma's schema is the source of truth; kept in sync manually,
 * matching how routes/exhibitions.ts hand-writes its own zod enums instead
 * of importing Prisma's generated enum objects).
 */
export const EVENT_MODULE_VALUES = [
  "REGISTRATION",
  "TICKETING",
  "EXHIBITORS",
  "STALL_BOOKING",
  "FLOOR_PLAN",
  "CHECK_IN",
  "LEADS",
  "SPEAKERS",
  "SESSIONS",
  "SPONSORS",
  "VENDORS",
  "VOLUNTEERS",
  "SEATING",
  "ANALYTICS",
] as const satisfies readonly EventModule[];

/**
 * Centralized module-configuration registry, the same "Record keyed by a
 * fixed enum" shape as lib/notificationEventRegistry.ts's NOTIFICATION_EVENTS.
 * No module has a defined configuration shape yet — every one of them uses
 * an explicit empty/strict schema (rejects any key) rather than accepting
 * arbitrary JSON. A future module that needs real config replaces its entry
 * here; nothing about the route layer changes.
 */
const EMPTY_CONFIG_SCHEMA = z.object({}).strict();

export const MODULE_CONFIG_SCHEMAS: Record<EventModule, z.ZodSchema> = {
  REGISTRATION: EMPTY_CONFIG_SCHEMA,
  TICKETING: EMPTY_CONFIG_SCHEMA,
  EXHIBITORS: EMPTY_CONFIG_SCHEMA,
  STALL_BOOKING: EMPTY_CONFIG_SCHEMA,
  FLOOR_PLAN: EMPTY_CONFIG_SCHEMA,
  CHECK_IN: EMPTY_CONFIG_SCHEMA,
  LEADS: EMPTY_CONFIG_SCHEMA,
  SPEAKERS: EMPTY_CONFIG_SCHEMA,
  SESSIONS: EMPTY_CONFIG_SCHEMA,
  SPONSORS: EMPTY_CONFIG_SCHEMA,
  VENDORS: EMPTY_CONFIG_SCHEMA,
  VOLUNTEERS: EMPTY_CONFIG_SCHEMA,
  SEATING: EMPTY_CONFIG_SCHEMA,
  ANALYTICS: EMPTY_CONFIG_SCHEMA,
};

export function validateModuleConfig(moduleType: EventModule, config: unknown) {
  return MODULE_CONFIG_SCHEMAS[moduleType].safeParse(config ?? {});
}
