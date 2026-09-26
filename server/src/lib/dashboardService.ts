import type { User } from "@prisma/client";
import { DashboardOwnerType } from "@prisma/client";
import { prisma } from "./prisma";
import { exhibitorBusinessIdsWithPermission, isPlatformAdmin, organizerIdsWithPermission } from "./access";
import { getDashboardWidget, type DashboardWidgetDefinition } from "./dashboardWidgetRegistry";
import { validateDashboardLayout, validateDashboardName, validateDashboardOwner } from "./dashboardStoragePolicy";
import type { Permission } from "./permissions";

export type DashboardOwner = { ownerType: DashboardOwnerType; ownerId: string | null };

export class DashboardApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "DashboardApiError"; }
}

function assertJsonConfig(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new DashboardApiError(400, "Widget configuration must be a JSON object");
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { throw new DashboardApiError(400, "Widget configuration is not valid JSON"); }
  if (serialized.length > 16_384) throw new DashboardApiError(400, "Widget configuration exceeds the maximum size");
  return value as Record<string, unknown>;
}

function assertWidgetDefinition(widgetType: string): DashboardWidgetDefinition {
  const definition = getDashboardWidget(widgetType);
  if (!definition) throw new DashboardApiError(422, "Unknown dashboard widget type");
  return definition;
}

async function assertOwnerAccess(user: User, owner: DashboardOwner, permission: Permission): Promise<void> {
  validateDashboardOwner(owner.ownerType, owner.ownerId);
  if (owner.ownerType === DashboardOwnerType.PLATFORM) {
    if (!isPlatformAdmin(user)) throw new DashboardApiError(403, "Platform dashboard access required");
    return;
  }
  if (!owner.ownerId) throw new DashboardApiError(400, "Dashboard owner ID is required");
  const ids = owner.ownerType === DashboardOwnerType.ORGANIZER
    ? await organizerIdsWithPermission(user, permission)
    : await exhibitorBusinessIdsWithPermission(user, permission);
  if (!ids.includes(owner.ownerId)) throw new DashboardApiError(403, "You do not have access to this dashboard owner");
}

async function getDashboardOrThrow(user: User, id: string, permission: Permission, includeArchived = false) {
  const dashboard = await prisma.dashboard.findUnique({
    where: { id },
    include: { widgets: { where: { archivedAt: null }, orderBy: [{ y: "asc" }, { x: "asc" }] } },
  });
  if (!dashboard) throw new DashboardApiError(404, "Dashboard not found");
  if (!includeArchived && dashboard.archivedAt) throw new DashboardApiError(404, "Dashboard not found");
  await assertOwnerAccess(user, { ownerType: dashboard.ownerType, ownerId: dashboard.ownerId }, permission);
  return dashboard;
}

async function canReadWidget(user: User, owner: DashboardOwner, widgetType: string): Promise<boolean> {
  const definition = getDashboardWidget(widgetType);
  if (!definition) return false;
  const role = owner.ownerType === DashboardOwnerType.PLATFORM ? "PLATFORM_ADMIN" : owner.ownerType === DashboardOwnerType.ORGANIZER ? "ORGANIZER" : "EXHIBITOR";
  if (!definition.roles.includes(role)) return false;
  if (isPlatformAdmin(user)) return true;
  for (const permission of definition.requiredPermissions) {
    const ids = owner.ownerType === DashboardOwnerType.ORGANIZER
      ? await organizerIdsWithPermission(user, permission as Permission)
      : await exhibitorBusinessIdsWithPermission(user, permission as Permission);
    if (!owner.ownerId || !ids.includes(owner.ownerId)) return false;
  }
  return true;
}

async function sanitizeDashboard(user: User, dashboard: any) {
  const owner = { ownerType: dashboard.ownerType, ownerId: dashboard.ownerId } as DashboardOwner;
  const visibleWidgets = [];
  for (const widget of dashboard.widgets ?? []) {
    if (await canReadWidget(user, owner, widget.widgetType)) visibleWidgets.push(widget);
  }
  return { ...dashboard, widgets: visibleWidgets };
}

function audit(user: User, action: string, entityId: string, metadata?: Record<string, unknown>) {
  return prisma.auditLog.create({ data: { actorUserId: user.id, action, entityType: "Dashboard", entityId, metadata } });
}

export async function listDashboards(user: User, input: { ownerType?: DashboardOwnerType; ownerId?: string; includeArchived?: boolean }) {
  const includeArchived = Boolean(input.includeArchived);
  const owners: DashboardOwner[] = [];
  if (!input.ownerType || input.ownerType === DashboardOwnerType.PLATFORM) {
    if (isPlatformAdmin(user)) owners.push({ ownerType: DashboardOwnerType.PLATFORM, ownerId: null });
    else if (input.ownerType === DashboardOwnerType.PLATFORM) throw new DashboardApiError(403, "Platform dashboard access required");
  }
  if (!input.ownerType || input.ownerType === DashboardOwnerType.ORGANIZER) {
    const ids = await organizerIdsWithPermission(user, includeArchived ? "dashboard:manage" : "dashboard:view");
    if (input.ownerId) {
      if (!ids.includes(input.ownerId)) throw new DashboardApiError(403, "You do not have access to this organizer");
      owners.push({ ownerType: DashboardOwnerType.ORGANIZER, ownerId: input.ownerId });
    } else owners.push(...ids.map(ownerId => ({ ownerType: DashboardOwnerType.ORGANIZER, ownerId })));
  }
  if (!input.ownerType || input.ownerType === DashboardOwnerType.EXHIBITOR) {
    const ids = await exhibitorBusinessIdsWithPermission(user, includeArchived ? "dashboard:manage" : "dashboard:view");
    if (input.ownerId) {
      if (!ids.includes(input.ownerId)) throw new DashboardApiError(403, "You do not have access to this exhibitor business");
      owners.push({ ownerType: DashboardOwnerType.EXHIBITOR, ownerId: input.ownerId });
    } else owners.push(...ids.map(ownerId => ({ ownerType: DashboardOwnerType.EXHIBITOR, ownerId })));
  }
  if (input.ownerType === DashboardOwnerType.PLATFORM && input.ownerId) throw new DashboardApiError(400, "Platform dashboards cannot have an owner ID");
  if (!owners.length) return [];
  const rows = await prisma.dashboard.findMany({
    where: {
      OR: owners.map(owner => ({ ownerType: owner.ownerType, ownerId: owner.ownerId, ...(includeArchived ? {} : { archivedAt: null }) })),
    },
    include: { widgets: { where: { archivedAt: null }, orderBy: [{ y: "asc" }, { x: "asc" }] } },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  const sanitized = [];
  for (const row of rows) sanitized.push(await sanitizeDashboard(user, row));
  return sanitized;
}

export async function createDashboard(user: User, input: { ownerType: DashboardOwnerType; ownerId: string | null; name: string; isDefault?: boolean; widgets?: Array<{ widgetType: string; x?: number; y?: number; width?: number; height?: number; configuration?: unknown; isVisible?: boolean }> }) {
  validateDashboardName(input.name);
  await assertOwnerAccess(user, { ownerType: input.ownerType, ownerId: input.ownerId }, "dashboard:manage");
  const widgets = [];
  for (const item of input.widgets ?? []) {
    const definition = assertWidgetDefinition(item.widgetType);
    const role = input.ownerType === DashboardOwnerType.PLATFORM ? "PLATFORM_ADMIN" : input.ownerType === DashboardOwnerType.ORGANIZER ? "ORGANIZER" : "EXHIBITOR";
    if (!definition.roles.includes(role)) throw new DashboardApiError(422, `Widget ${item.widgetType} is not valid for this dashboard owner type`);
    for (const permission of definition.requiredPermissions) {
      if (input.ownerType === DashboardOwnerType.PLATFORM) {
        if (!isPlatformAdmin(user)) throw new DashboardApiError(403, "Platform dashboard access required");
      } else {
        const ids = input.ownerType === DashboardOwnerType.ORGANIZER
          ? await organizerIdsWithPermission(user, permission as Permission)
          : await exhibitorBusinessIdsWithPermission(user, permission as Permission);
        if (!ids.includes(input.ownerId!)) throw new DashboardApiError(403, `Missing permission for widget ${item.widgetType}`);
      }
    }
    const layout = { x: item.x ?? 0, y: item.y ?? 0, width: item.width ?? definition.defaultLayout.width, height: item.height ?? definition.defaultLayout.height };
    validateDashboardLayout(layout);
    widgets.push({ ...layout, widgetType: item.widgetType, configuration: assertJsonConfig(item.configuration), isVisible: item.isVisible ?? true });
  }
  try {
    const dashboard = await prisma.$transaction(async tx => {
      const created = await tx.dashboard.create({
        data: {
          ownerType: input.ownerType, ownerId: input.ownerId, name: input.name.trim(), isDefault: input.isDefault ?? false,
          widgets: widgets.length ? { create: widgets } : undefined,
        },
        include: { widgets: { where: { archivedAt: null }, orderBy: [{ y: "asc" }, { x: "asc" }] } },
      });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: "dashboard.created", entityType: "Dashboard", entityId: created.id, metadata: { ownerType: created.ownerType, ownerId: created.ownerId } } });
      return created;
    });
    return dashboard;
  } catch (error: any) {
    if (error?.code === "P2002") throw new DashboardApiError(409, "A default dashboard already exists for this owner");
    throw error;
  }
}

export async function getDashboard(user: User, id: string, includeArchived = false) {
  const dashboard = await getDashboardOrThrow(user, id, includeArchived ? "dashboard:manage" : "dashboard:view", includeArchived);
  return sanitizeDashboard(user, dashboard);
}

export async function updateDashboard(user: User, id: string, input: { version: number; name?: string; isDefault?: boolean; ownerType?: DashboardOwnerType; ownerId?: string | null }) {
  const current = await getDashboardOrThrow(user, id, "dashboard:manage");
  if (input.version !== current.version) throw new DashboardApiError(409, "Dashboard has changed; reload before updating");
  const owner = { ownerType: input.ownerType ?? current.ownerType, ownerId: input.ownerId === undefined ? current.ownerId : input.ownerId };
  await assertOwnerAccess(user, owner, "dashboard:manage");
  if (input.name !== undefined) validateDashboardName(input.name);
  try {
    const updated = await prisma.$transaction(async tx => {
      const result = await tx.dashboard.updateMany({
        where: { id, version: input.version, archivedAt: null },
        data: { ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }), ownerType: owner.ownerType, ownerId: owner.ownerId, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new DashboardApiError(409, "Dashboard has changed; reload before updating");
      const row = await tx.dashboard.findUniqueOrThrow({ where: { id }, include: { widgets: { where: { archivedAt: null }, orderBy: [{ y: "asc" }, { x: "asc" }] } } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: "dashboard.updated", entityType: "Dashboard", entityId: id, metadata: { version: input.version, newVersion: row.version } } });
      return row;
    });
    return updated;
  } catch (error: any) {
    if (error?.code === "P2002") throw new DashboardApiError(409, "A default dashboard already exists for this owner");
    throw error;
  }
}

export async function archiveDashboard(user: User, id: string, version: number) {
  const current = await getDashboardOrThrow(user, id, "dashboard:manage");
  if (current.version !== version) throw new DashboardApiError(409, "Dashboard has changed; reload before archiving");
  const result = await prisma.dashboard.updateMany({ where: { id, version, archivedAt: null }, data: { archivedAt: new Date(), version: { increment: 1 } } });
  if (result.count !== 1) throw new DashboardApiError(409, "Dashboard has changed; reload before archiving");
  await audit(user, "dashboard.archived", id, { version, newVersion: version + 1 });
}

export async function restoreDashboard(user: User, id: string, version: number) {
  const current = await getDashboardOrThrow(user, id, "dashboard:manage", true);
  if (!current.archivedAt) return current;
  try {
    const result = await prisma.dashboard.updateMany({ where: { id, version, archivedAt: { not: null } }, data: { archivedAt: null, version: { increment: 1 } } });
    if (result.count !== 1) throw new DashboardApiError(409, "Dashboard has changed; reload before restoring");
    await audit(user, "dashboard.restored", id, { version, newVersion: version + 1 });
    return getDashboard(user, id);
  } catch (error: any) {
    if (error?.code === "P2002") throw new DashboardApiError(409, "An active default dashboard already exists for this owner");
    throw error;
  }
}

export async function addWidget(user: User, dashboardId: string, input: { widgetType: string; x?: number; y?: number; width?: number; height?: number; configuration?: unknown; isVisible?: boolean }) {
  const dashboard = await getDashboardOrThrow(user, dashboardId, "dashboard:manage");
  const definition = assertWidgetDefinition(input.widgetType);
  const owner = { ownerType: dashboard.ownerType, ownerId: dashboard.ownerId };
  for (const permission of definition.requiredPermissions) await assertOwnerAccess(user, owner, permission as Permission);
  const layout = { x: input.x ?? 0, y: input.y ?? 0, width: input.width ?? definition.defaultLayout.width, height: input.height ?? definition.defaultLayout.height };
  validateDashboardLayout(layout);
  const widget = await prisma.$transaction(async tx => {
    const created = await tx.dashboardWidget.create({ data: { dashboardId, widgetType: input.widgetType, ...layout, configuration: assertJsonConfig(input.configuration), isVisible: input.isVisible ?? true } });
    await tx.dashboard.update({ where: { id: dashboardId }, data: { version: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorUserId: user.id, action: "dashboard.widget.created", entityType: "DashboardWidget", entityId: created.id, metadata: { dashboardId, widgetType: input.widgetType } } });
    return created;
  });
  return widget;
}

export async function updateWidget(user: User, dashboardId: string, widgetId: string, input: { version: number; widgetType?: string; x?: number; y?: number; width?: number; height?: number; configuration?: unknown; isVisible?: boolean }) {
  const dashboard = await getDashboardOrThrow(user, dashboardId, "dashboard:manage");
  const current = dashboard.widgets.find(w => w.id === widgetId);
  if (!current) throw new DashboardApiError(404, "Dashboard widget not found");
  const definition = assertWidgetDefinition(input.widgetType ?? current.widgetType);
  for (const permission of definition.requiredPermissions) await assertOwnerAccess(user, { ownerType: dashboard.ownerType, ownerId: dashboard.ownerId }, permission as Permission);
  if (input.version !== dashboard.version) throw new DashboardApiError(409, "Dashboard has changed; reload before updating");
  const layout = { x: input.x ?? current.x, y: input.y ?? current.y, width: input.width ?? current.width, height: input.height ?? current.height };
  validateDashboardLayout(layout);
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.dashboardWidget.update({ where: { id: widgetId }, data: { widgetType: definition.id, ...layout, ...(input.configuration === undefined ? {} : { configuration: assertJsonConfig(input.configuration) }), ...(input.isVisible === undefined ? {} : { isVisible: input.isVisible }) } });
    await tx.dashboard.update({ where: { id: dashboardId }, data: { version: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorUserId: user.id, action: "dashboard.widget.updated", entityType: "DashboardWidget", entityId: widgetId, metadata: { dashboardId, widgetType: definition.id } } });
    return updated;
  });
  return result;
}

export async function archiveWidget(user: User, dashboardId: string, widgetId: string) {
  const dashboard = await getDashboardOrThrow(user, dashboardId, "dashboard:manage");
  const current = dashboard.widgets.find(w => w.id === widgetId);
  if (!current) throw new DashboardApiError(404, "Dashboard widget not found");
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.dashboardWidget.update({ where: { id: widgetId }, data: { archivedAt: new Date() } });
    await tx.dashboard.update({ where: { id: dashboardId }, data: { version: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorUserId: user.id, action: "dashboard.widget.archived", entityType: "DashboardWidget", entityId: widgetId, metadata: { dashboardId } } });
    return updated;
  });
  return result;
}
