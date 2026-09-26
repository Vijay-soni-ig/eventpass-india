import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { exhibitionMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);
const statusSchema = z.enum(["draft","published","archived"]);
const typeSchema = z.enum(["entrance","zone","space","facility","seating","parking","custom"]);

const mapCreate = z.object({
  floorId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).optional(),
  backgroundUrl: z.string().trim().url().max(2000).optional(),
  canvasWidth: z.number().positive().max(100000),
  canvasHeight: z.number().positive().max(100000),
});
const mapUpdate = mapCreate.partial();
const objectCreate = z.object({
  type: typeSchema,
  label: z.string().trim().max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  spaceId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  entranceId: z.string().uuid().nullable().optional(),
  x: z.number().min(-100000).max(100000),
  y: z.number().min(-100000).max(100000),
  width: z.number().positive().max(100000),
  height: z.number().positive().max(100000),
  rotation: z.number().min(-360).max(360).default(0),
  zIndex: z.number().int().min(-100000).max(100000).default(0),
  isVisible: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const objectUpdate = objectCreate.partial();

async function venueAccess(venueId: string, user: Express.Request["user"], permission: "venue:view"|"venue:manage") {
  if (!user) return null;
  const ids = await organizerIdsWithPermission(user, permission);
  if (!ids.length) return null;
  return prisma.venue.findFirst({ where: { id: venueId, organizerId: { in: ids }, status: { not: "archived" } }, select: { id: true } });
}
async function validFloor(floorId: string|null|undefined, venueId: string) {
  if (!floorId) return true;
  return Boolean(await prisma.venueFloor.findFirst({ where: { id: floorId, status: { not: "archived" }, building: { status: { not: "archived" }, venueId } }, select: { id: true } }));
}
async function validLinks(input: {spaceId?: string|null; zoneId?: string|null; entranceId?: string|null}, venueId: string) {
  if (input.zoneId && !await prisma.venueZone.findFirst({ where: { id: input.zoneId, status: { not: "archived" }, floor: { status: { not: "archived" }, building: { status: { not: "archived" }, venueId } } }, select: { id: true } })) return "Zone not found in this venue";
  if (input.spaceId && !await prisma.venueSpace.findFirst({ where: { id: input.spaceId, status: { not: "archived" }, zone: { status: { not: "archived" }, floor: { status: { not: "archived" }, building: { status: { not: "archived" }, venueId } } } }, select: { id: true } })) return "Space not found in this venue";
  if (input.entranceId && !await prisma.venueEntrance.findFirst({ where: { id: input.entranceId, status: { not: "archived" }, venueId }, select: { id: true } })) return "Entrance not found in this venue";
  return null;
}

router.get("/venues/:venueId/maps", async (req,res)=>{
  const venue=await venueAccess(req.params.venueId,req.user,"venue:view"); if(!venue) return res.status(404).json({error:"Venue not found"});
  const status=typeof req.query.status==="string"&&statusSchema.safeParse(req.query.status).success ? req.query.status as z.infer<typeof statusSchema> : undefined;
  const floorId=typeof req.query.floorId==="string"?req.query.floorId:undefined;
  const maps=await prisma.venueMap.findMany({where:{venueId:venue.id,...(status?{status}:{status:{not:"archived" as const}}),...(floorId?{floorId}:{})},orderBy:[{name:"asc"},{createdAt:"desc"}],include:{_count:{select:{objects:true}}}});
  return res.json({maps});
});
router.post("/venues/:venueId/maps",exhibitionMutationRateLimit,async(req,res)=>{
  const venue=await venueAccess(req.params.venueId,req.user,"venue:manage"); if(!venue)return res.status(404).json({error:"Venue not found"});
  const p=mapCreate.safeParse(req.body); if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
  if(!await validFloor(p.data.floorId,venue.id))return res.status(400).json({error:"Floor does not belong to this venue"});
  try{const map=await prisma.venueMap.create({data:{...p.data,venueId:venue.id}});await logAudit({actorUserId:req.user!.id,action:"venue_map.created",entityType:"VenueMap",entityId:map.id,metadata:{venueId:venue.id}});return res.status(201).json({map});}
  catch(e){if(typeof e==="object"&&e&&"code"in e&&e.code==="P2002")return res.status(409).json({error:"A map with this name already exists for the venue"});throw e;}
});
router.get("/maps/:id",async(req,res)=>{
  const map=await prisma.venueMap.findUnique({where:{id:req.params.id},include:{objects:{orderBy:[{zIndex:"asc"},{createdAt:"asc"}]}}});if(!map)return res.status(404).json({error:"Map not found"});
  if(!await venueAccess(map.venueId,req.user,"venue:view"))return res.status(404).json({error:"Map not found"});return res.json({map});
});
router.patch("/maps/:id",exhibitionMutationRateLimit,async(req,res)=>{
  const map=await prisma.venueMap.findUnique({where:{id:req.params.id},select:{id:true,venueId:true,status:true}});if(!map)return res.status(404).json({error:"Map not found"});
  if(!await venueAccess(map.venueId,req.user,"venue:manage"))return res.status(404).json({error:"Map not found"});
  const p=mapUpdate.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});
  if(p.data.floorId!==undefined&&!await validFloor(p.data.floorId,map.venueId))return res.status(400).json({error:"Floor does not belong to this venue"});
  if(map.status==="published")return res.status(400).json({error:"Published maps must be cloned or archived before editing"});
  try{const updated=await prisma.venueMap.update({where:{id:map.id},data:p.data});await logAudit({actorUserId:req.user!.id,action:"venue_map.updated",entityType:"VenueMap",entityId:map.id});return res.json({map:updated});}
  catch(e){if(typeof e==="object"&&e&&"code"in e&&e.code==="P2002")return res.status(409).json({error:"A map with this name already exists for the venue"});throw e;}
});
router.delete("/maps/:id",exhibitionMutationRateLimit,async(req,res)=>{
  const map=await prisma.venueMap.findUnique({where:{id:req.params.id},select:{id:true,venueId:true}});if(!map)return res.status(404).json({error:"Map not found"});if(!await venueAccess(map.venueId,req.user,"venue:manage"))return res.status(404).json({error:"Map not found"});
  const updated=await prisma.venueMap.update({where:{id:map.id},data:{status:"archived",archivedAt:new Date()}});await logAudit({actorUserId:req.user!.id,action:"venue_map.archived",entityType:"VenueMap",entityId:map.id});return res.json({map:updated});
});
router.post("/maps/:id/restore",exhibitionMutationRateLimit,async(req,res)=>{
  const map=await prisma.venueMap.findUnique({where:{id:req.params.id},select:{id:true,venueId:true}});if(!map)return res.status(404).json({error:"Map not found"});if(!await venueAccess(map.venueId,req.user,"venue:manage"))return res.status(404).json({error:"Map not found"});
  const updated=await prisma.venueMap.update({where:{id:map.id},data:{status:"draft",archivedAt:null}});return res.json({map:updated});
});
router.post("/maps/:id/publish",exhibitionMutationRateLimit,async(req,res)=>{
  const map=await prisma.venueMap.findUnique({where:{id:req.params.id},select:{id:true,venueId:true,floorId:true,status:true}});if(!map)return res.status(404).json({error:"Map not found"});if(!await venueAccess(map.venueId,req.user,"venue:manage"))return res.status(404).json({error:"Map not found"});if(map.status==="archived")return res.status(400).json({error:"Archived maps cannot be published"});
  const published=await prisma.$transaction(async tx=>{await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))","venue-map:"+map.venueId+":"+(map.floorId??"venue"));await tx.venueMap.updateMany({where:{venueId:map.venueId,floorId:map.floorId,status:"published",id:{not:map.id}},data:{status:"archived",archivedAt:new Date()}});return tx.venueMap.update({where:{id:map.id},data:{status:"published",publishedAt:new Date(),archivedAt:null,version:{increment:1}}});});
  await logAudit({actorUserId:req.user!.id,action:"venue_map.published",entityType:"VenueMap",entityId:map.id,metadata:{venueId:map.venueId,floorId:map.floorId}});return res.json({map:published});
});
router.get("/maps/:id/objects",async(req,res)=>{
  const map=await prisma.venueMap.findUnique({where:{id:req.params.id},select:{id:true,venueId:true}});if(!map)return res.status(404).json({error:"Map not found"});if(!await venueAccess(map.venueId,req.user,"venue:view"))return res.status(404).json({error:"Map not found"});
  return res.json({objects:await prisma.venueMapObject.findMany({where:{venueMapId:map.id},orderBy:[{zIndex:"asc"},{createdAt:"asc"}]})});
});
router.post("/maps/:id/objects",exhibitionMutationRateLimit,async(req,res)=>{
  const map=await prisma.venueMap.findUnique({where:{id:req.params.id},select:{id:true,venueId:true,status:true}});if(!map)return res.status(404).json({error:"Map not found"});if(!await venueAccess(map.venueId,req.user,"venue:manage"))return res.status(404).json({error:"Map not found"});if(map.status!=="draft")return res.status(400).json({error:"Only draft maps can be edited"});
  const p=objectCreate.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});const err=await validLinks(p.data,map.venueId);if(err)return res.status(400).json({error:err});
  const createData: Prisma.VenueMapObjectUncheckedCreateInput = { ...p.data, venueMapId: map.id, metadata: p.data.metadata as Prisma.InputJsonValue | undefined };\n  const object = await prisma.venueMapObject.create({data:createData});
  await logAudit({actorUserId:req.user!.id,action:"venue_map_object.created",entityType:"VenueMapObject",entityId:object.id,metadata:{venueMapId:map.id,venueId:map.venueId}});
  return res.status(201).json({object});
});
router.patch("/objects/:id",exhibitionMutationRateLimit,async(req,res)=>{
  const object=await prisma.venueMapObject.findUnique({where:{id:req.params.id},include:{venueMap:{select:{venueId:true,status:true}}}});if(!object)return res.status(404).json({error:"Map object not found"});if(!await venueAccess(object.venueMap.venueId,req.user,"venue:manage"))return res.status(404).json({error:"Map object not found"});if(object.venueMap.status!=="draft")return res.status(400).json({error:"Only draft maps can be edited"});
  const p=objectUpdate.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0].message});const err=await validLinks(p.data,object.venueMap.venueId);if(err)return res.status(400).json({error:err});
  const updateData: Prisma.VenueMapObjectUncheckedUpdateInput = { ...p.data, metadata: p.data.metadata as Prisma.InputJsonValue | undefined };\n  const updated = await prisma.venueMapObject.update({where:{id:object.id},data:updateData});
  await logAudit({actorUserId:req.user!.id,action:"venue_map_object.updated",entityType:"VenueMapObject",entityId:updated.id,metadata:{venueMapId:object.venueMapId,venueId:object.venueMap.venueId,changedFields:Object.keys(p.data)}});
  return res.json({object:updated});
});
router.delete("/objects/:id",exhibitionMutationRateLimit,async(req,res)=>{
  const object=await prisma.venueMapObject.findUnique({where:{id:req.params.id},include:{venueMap:{select:{venueId:true,status:true}}}});if(!object)return res.status(404).json({error:"Map object not found"});if(!await venueAccess(object.venueMap.venueId,req.user,"venue:manage"))return res.status(404).json({error:"Map object not found"});if(object.venueMap.status!=="draft")return res.status(400).json({error:"Only draft maps can be edited"});await prisma.venueMapObject.delete({where:{id:object.id}});await logAudit({actorUserId:req.user!.id,action:"venue_map_object.deleted",entityType:"VenueMapObject",entityId:object.id,metadata:{venueMapId:object.venueMapId,venueId:object.venueMap.venueId}});return res.json({success:true});
});
export default router;
