export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_MAX_WIDGET_HEIGHT = 20;
export const DASHBOARD_MAX_NAME_LENGTH = 100;

export type DashboardOwnerType = "PLATFORM" | "ORGANIZER" | "EXHIBITOR";

export interface DashboardLayoutInput {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function validateDashboardLayout(layout: DashboardLayoutInput): void {
  if (!Number.isInteger(layout.x) || !Number.isInteger(layout.y) || !Number.isInteger(layout.width) || !Number.isInteger(layout.height)) {
    throw new Error("Dashboard widget layout values must be integers");
  }
  if (layout.x < 0 || layout.y < 0) throw new Error("Dashboard widget coordinates cannot be negative");
  if (layout.width < 1 || layout.width > DASHBOARD_GRID_COLUMNS) throw new Error("Dashboard widget width must be between 1 and 12");
  if (layout.height < 1 || layout.height > DASHBOARD_MAX_WIDGET_HEIGHT) throw new Error("Dashboard widget height is outside the allowed range");
  if (layout.x + layout.width > DASHBOARD_GRID_COLUMNS) throw new Error("Dashboard widget exceeds the 12-column grid");
}

export function validateDashboardName(name: string): void {
  if (!name.trim()) throw new Error("Dashboard name is required");
  if (name.trim().length > DASHBOARD_MAX_NAME_LENGTH) throw new Error("Dashboard name exceeds the maximum length");
}

export function validateDashboardOwner(ownerType: DashboardOwnerType, ownerId: string | null): void {
  if (ownerType === "PLATFORM" && ownerId !== null) throw new Error("Platform dashboards must not have an owner ID");
  if (ownerType !== "PLATFORM" && !ownerId) throw new Error("Non-platform dashboards require an owner ID");
}
