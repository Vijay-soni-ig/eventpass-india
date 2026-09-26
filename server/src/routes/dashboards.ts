import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { DashboardOwnerType } from "@prisma/client";
import { DashboardApiError, addWidget, archiveDashboard, archiveWidget, createDashboard, getDashboard, listDashboards, restoreDashboard, updateDashboard, updateWidget } from "../lib/dashboardService";

const router = Router();
router.use(requireAuth);

const ownerType = z.nativeEnum(DashboardOwnerType);
const layout = z.object({ x: z.number().int().nonnegative().optional(), y: z.number().int().nonnegative().optional(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional() });
const widgetInput = layout.extend({ widgetType: z.string().min(1).max(100), configuration: z.unknown().optional(), isVisible: z.boolean().optional() });
const ownerInput = z.object({ ownerType, ownerId: z.string().uuid().nullable() });
const createSchema = ownerInput.extend({ name: z.string().trim().min(1).max(100), isDefault: z.boolean().optional(), widgets: z.array(widgetInput).max(100).optional() });
const updateSchema = z.object({ version: z.number().int().positive(), name: z.string().trim().min(1).max(100).optional(), isDefault: z.boolean().optional(), ownerType: ownerType.optional(), ownerId: z.string().uuid().nullable().optional() });
const updateWidgetSchema = widgetInput.partial().extend({ version: z.number().int().positive() });

function handleError(res: Response, error: unknown) {
  if (error instanceof DashboardApiError) return res.status(error.status).json({ error: error.message });
  throw error;
}

router.get("/", async (req, res, next) => {
  try {
    const owner = ownerType.safeParse(req.query.ownerType);
    if (req.query.ownerType && !owner.success) return res.status(400).json({ error: "Invalid ownerType" });
    const ownerId = typeof req.query.ownerId === "string" ? req.query.ownerId : undefined;
    if (ownerId && !owner.success) return res.status(400).json({ error: "ownerType is required when ownerId is provided" });
    if (ownerId && !z.string().uuid().safeParse(ownerId).success) return res.status(400).json({ error: "Invalid ownerId" });
    const includeArchived = req.query.includeArchived === "true";
    const rows = await listDashboards(req.user!, { ownerType: owner.success ? owner.data : undefined, ownerId, includeArchived });
    return res.json({ dashboards: rows });
  } catch (error) { return handleError(res, error); }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid dashboard payload" });
    const dashboard = await createDashboard(req.user!, parsed.data);
    return res.status(201).json({ dashboard });
  } catch (error) { return handleError(res, error); }
});

router.get("/:id", async (req, res) => {
  try { return res.json({ dashboard: await getDashboard(req.user!, req.params.id) }); }
  catch (error) { return handleError(res, error); }
});

router.put("/:id", async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid dashboard payload" });
    return res.json({ dashboard: await updateDashboard(req.user!, req.params.id, parsed.data) });
  } catch (error) { return handleError(res, error); }
});

router.delete("/:id", async (req, res) => {
  try {
    const version = z.number().int().positive().safeParse(req.body?.version);
    if (!version.success) return res.status(400).json({ error: "version is required" });
    await archiveDashboard(req.user!, req.params.id, version.data);
    return res.status(204).send();
  } catch (error) { return handleError(res, error); }
});

router.post("/:id/restore", async (req, res) => {
  try {
    const version = z.number().int().positive().safeParse(req.body?.version);
    if (!version.success) return res.status(400).json({ error: "version is required" });
    return res.json({ dashboard: await restoreDashboard(req.user!, req.params.id, version.data) });
  } catch (error) { return handleError(res, error); }
});

router.post("/:id/widgets", async (req, res) => {
  try {
    const parsed = widgetInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid widget payload" });
    return res.status(201).json({ widget: await addWidget(req.user!, req.params.id, parsed.data) });
  } catch (error) { return handleError(res, error); }
});

router.put("/:id/widgets/:widgetId", async (req, res) => {
  try {
    const parsed = updateWidgetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid widget payload" });
    return res.json({ widget: await updateWidget(req.user!, req.params.id, req.params.widgetId, parsed.data) });
  } catch (error) { return handleError(res, error); }
});

router.delete("/:id/widgets/:widgetId", async (req, res) => {
  try {
    await archiveWidget(req.user!, req.params.id, req.params.widgetId);
    return res.status(204).send();
  } catch (error) { return handleError(res, error); }
});

export default router;
