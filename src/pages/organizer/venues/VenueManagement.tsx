import { useEffect, useState } from "react";
import { Building2, Plus, MapPin, Layers3, Trash2, RotateCcw, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import { api } from "@/lib/apiClient";

type CapacityRule = { id: string; name: string; maxOccupancy: number; seatedCapacity: number | null; standingCapacity: number | null; wheelchairCapacity: number | null };
type Space = { id: string; name: string; code: string | null; type: string; status: string; capacityRules: CapacityRule[] };
type Zone = { id: string; name: string; code: string | null; type: string; status: string; spaces: Space[] };
type Floor = { id: string; name: string; code: string | null; level: number; status: string; zones: Zone[] };
type Building = { id: string; name: string; code: string | null; status: string; floors: Floor[] };
type Venue = { id: string; name: string; code: string | null; city: string | null; state: string | null; status: string; buildings: Building[] };

const spaceTypeLabels: Record<string, string> = {
  room: "Room",
  meeting_room: "Meeting room",
  conference_room: "Conference room",
  auditorium: "Auditorium",
  hall: "Hall",
  office: "Office",
  storage: "Storage",
  service_room: "Service room",
  other: "Other",
};

export default function VenueManagement() {
  const { user } = useAuth();
  const canView = hasOrganizerPermission(user?.roles, "venue:view");
  const canManage = hasOrganizerPermission(user?.roles, "venue:manage");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [buildingNames, setBuildingNames] = useState<Record<string, string>>({});
  const [floorNames, setFloorNames] = useState<Record<string, string>>({});
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({});
  const [spaceNames, setSpaceNames] = useState<Record<string, string>>({});
  const [capacityNames, setCapacityNames] = useState<Record<string, string>>({});
  const [capacityValues, setCapacityValues] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ venues: Venue[] }>("/api/venues?pageSize=100");
      const detailed = await Promise.all(data.venues.map((venue) => api.get<{ venue: Venue }>(`/api/venues/${venue.id}`)));
      setVenues(detailed.map((item) => item.venue));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load venues");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const createVenue = async () => {
    if (!name.trim()) return;
    try {
      await api.post("/api/venues", { name: name.trim() });
      setName("");
      toast.success("Venue created");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create venue");
    }
  };

  const createBuilding = async (venueId: string) => {
    const value = buildingNames[venueId]?.trim();
    if (!value) return;
    try {
      await api.post(`/api/venues/${venueId}/buildings`, { name: value });
      setBuildingNames((current) => ({ ...current, [venueId]: "" }));
      toast.success("Building added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add building");
    }
  };

  const createFloor = async (buildingId: string, currentFloors: Floor[]) => {
    const value = floorNames[buildingId]?.trim();
    if (!value) return;
    try {
      await api.post(`/api/venues/buildings/${buildingId}/floors`, { name: value, level: currentFloors.length });
      setFloorNames((current) => ({ ...current, [buildingId]: "" }));
      toast.success("Floor added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add floor");
    }
  };

  const createZone = async (floorId: string) => {
    const value = zoneNames[floorId]?.trim();
    if (!value) return;
    try {
      await api.post(`/api/venue-zones/floors/${floorId}/zones`, { name: value });
      setZoneNames((current) => ({ ...current, [floorId]: "" }));
      toast.success("Zone added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add zone");
    }
  };

  const createSpace = async (zoneId: string) => {
    const value = spaceNames[zoneId]?.trim();
    if (!value) return;
    try {
      await api.post(`/api/venue-spaces/zones/${zoneId}/spaces`, { name: value });
      setSpaceNames((current) => ({ ...current, [zoneId]: "" }));
      toast.success("Space added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add space");
    }
  };

  const createCapacityRule = async (spaceId: string) => {
    const ruleName = capacityNames[spaceId]?.trim();
    const max = Number(capacityValues[spaceId]);
    if (!ruleName || !Number.isInteger(max) || max < 1) return;
    try {
      await api.post(`/api/venue-capacity/spaces/${spaceId}/rules`, { name: ruleName, maxOccupancy: max });
      setCapacityNames((current) => ({ ...current, [spaceId]: "" }));
      setCapacityValues((current) => ({ ...current, [spaceId]: "" }));
      toast.success("Capacity rule added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add capacity rule");
    }
  };

  const archiveVenue = async (venueId: string) => {
    try {
      await api.delete(`/api/venues/${venueId}`);
      toast.success("Venue archived");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive venue");
    }
  };

  const restoreVenue = async (venueId: string) => {
    try {
      await api.post(`/api/venues/${venueId}/restore`, {});
      toast.success("Venue restored");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore venue");
    }
  };

  if (!canView) {
    return <EmptyState icon={Building2} title="Venue management access required" description="Your organizer role does not have permission to manage venues." />;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Venues</h1>
        <p className="text-muted-foreground">Manage reusable venues, buildings, floors, zones and spaces for your organization.</p>
      </div>

      <div className="flex gap-3 max-w-xl">
        {!canManage ? <span className="text-sm text-muted-foreground self-center">Read-only access</span> : null}
        <Input disabled={!canManage} value={name} onChange={(event) => setName(event.target.value)} placeholder="Venue name" onKeyDown={(event) => { if (event.key === "Enter") void createVenue(); }} />
        <Button disabled={!canManage} onClick={() => void createVenue()}><Plus className="w-4 h-4 mr-2" />Add Venue</Button>
      </div>

      {loading ? <LoadingState label="Loading venues..." /> : venues.length === 0 ? (
        <EmptyState icon={Building2} title="No venues yet" description="Create your first reusable venue." />
      ) : (
        <div className="space-y-4">
          {venues.map((venue) => (
            <section key={venue.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-lg">{venue.name}</h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />{venue.city || "Location not set"}{venue.state ? `, ${venue.state}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" disabled={!canManage} aria-label={venue.status === "archived" ? "Restore venue" : "Archive venue"} onClick={() => void (venue.status === "archived" ? restoreVenue(venue.id) : archiveVenue(venue.id))}>
                  {venue.status === "archived" ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>

              <div className="mt-5 space-y-4">
                {venue.buildings.map((building) => (
                  <div key={building.id} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 font-medium"><Building2 className="w-4 h-4" />{building.name}</div>
                    <div className="mt-3 space-y-3">
                      {building.floors.map((floor) => (
                        <div key={floor.id} className="rounded-md bg-muted/30 p-3">
                          <div className="flex items-center gap-2 text-sm font-medium"><Layers3 className="w-4 h-4" />{floor.name}<span className="text-muted-foreground">Level {floor.level}</span></div>
                          <div className="mt-3 space-y-2 pl-6">
                            {floor.zones.map((zone) => (
                              <div key={zone.id} className="rounded-md border bg-background p-3">
                                <div className="text-sm font-medium">{zone.name}<span className="ml-2 text-xs text-muted-foreground">{zone.type.replace("_", " ")}</span></div>
                                <div className="mt-2 space-y-1">
                                  {zone.spaces.length === 0 ? <p className="text-xs text-muted-foreground">No spaces yet.</p> : zone.spaces.map((space) => (
                                    <div key={space.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <DoorOpen className="w-3.5 h-3.5" />{space.name}<span className="text-xs">{space.code || spaceTypeLabels[space.type] || space.type}</span>
                                      {space.capacityRules.length > 0 ? <span className="text-xs">Capacity: {space.capacityRules.map((rule) => `${rule.name} ${rule.maxOccupancy}`).join(", ")}</span> : null}
                                    </div>
                                  ))}
                                </div>
                                {space.capacityRules.length === 0 && canManage ? <div className="mt-2 flex gap-2">
                                  <Input value={capacityNames[space.id] || ""} onChange={(event) => setCapacityNames((current) => ({ ...current, [space.id]: event.target.value }))} placeholder="Capacity rule" />
                                  <Input type="number" min={1} value={capacityValues[space.id] || ""} onChange={(event) => setCapacityValues((current) => ({ ...current, [space.id]: event.target.value }))} placeholder="Max" className="w-24" />
                                  <Button variant="outline" onClick={() => void createCapacityRule(space.id)}>Add Capacity</Button>
                                </div> : null}
                                <div className="mt-2 flex gap-2">
                                  <Input disabled={!canManage} value={spaceNames[zone.id] || ""} onChange={(event) => setSpaceNames((current) => ({ ...current, [zone.id]: event.target.value }))} placeholder="Space name" />
                                  <Button disabled={!canManage} variant="outline" onClick={() => void createSpace(zone.id)}>Add Space</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-2 pl-6">
                            <Input disabled={!canManage} value={zoneNames[floor.id] || ""} onChange={(event) => setZoneNames((current) => ({ ...current, [floor.id]: event.target.value }))} placeholder="Zone name" />
                            <Button disabled={!canManage} variant="outline" onClick={() => void createZone(floor.id)}>Add Zone</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Input disabled={!canManage} value={floorNames[building.id] || ""} onChange={(event) => setFloorNames((current) => ({ ...current, [building.id]: event.target.value }))} placeholder="Floor name" />
                      <Button disabled={!canManage} variant="outline" onClick={() => void createFloor(building.id, building.floors)}>Add Floor</Button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Input disabled={!canManage} value={buildingNames[venue.id] || ""} onChange={(event) => setBuildingNames((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Building name" />
                  <Button disabled={!canManage} variant="outline" onClick={() => void createBuilding(venue.id)}>Add Building</Button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
