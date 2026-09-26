import { useEffect, useState } from "react";
import { Building2, Plus, MapPin, Layers3, Trash2, RotateCcw, DoorOpen, LogIn, CarFront } from "lucide-react";
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
type Entrance = { id: string; name: string; code: string | null; type: string; floorId: string | null; isAccessible: boolean; isEmergencyExit: boolean; isPublic: boolean; status: string };
type Facility = { id: string; name: string; code: string | null; type: string; quantity: number; isAccessible: boolean; isPublic: boolean; status: string };
type SeatingArea = { id: string; name: string; code: string | null; type: string; capacity: number; accessibleSeats: number; status: string };
type ParkingArea = { id: string; name: string; code: string | null; type: string; totalSpaces: number; accessibleSpaces: number; evChargingSpaces: number; status: string };
type AvailabilityBlock = { id: string; name: string; type: string; startsAt: string; endsAt: string; status: string };
type MaintenanceBlock = { id: string; title: string; type: string; startsAt: string; endsAt: string; status: string };
type Venue = { id: string; name: string; code: string | null; city: string | null; state: string | null; status: string; buildings: Building[]; entrances: Entrance[]; parkingAreas: ParkingArea[]; facilities: Facility[]; seatingAreas: SeatingArea[]; availabilityBlocks: AvailabilityBlock[]; maintenanceBlocks: MaintenanceBlock[] };

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
  const [entranceNames, setEntranceNames] = useState<Record<string, string>>({});
  const [parkingNames, setParkingNames] = useState<Record<string, string>>({});
  const [parkingCapacity, setParkingCapacity] = useState<Record<string, string>>({});
  const [facilityNames, setFacilityNames] = useState<Record<string, string>>({});
  const [seatingNames, setSeatingNames] = useState<Record<string, string>>({});
  const [seatingCapacity, setSeatingCapacity] = useState<Record<string, string>>({});
  const [availabilityNames, setAvailabilityNames] = useState<Record<string, string>>({});
  const [availabilityStarts, setAvailabilityStarts] = useState<Record<string, string>>({});
  const [availabilityEnds, setAvailabilityEnds] = useState<Record<string, string>>({});
  const [maintenanceTitles, setMaintenanceTitles] = useState<Record<string, string>>({});
  const [maintenanceStarts, setMaintenanceStarts] = useState<Record<string, string>>({});
  const [maintenanceEnds, setMaintenanceEnds] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ venues: Venue[] }>("/api/venues?pageSize=100");
      const detailed = await Promise.all(data.venues.map(async (venue) => {
        const [detail, availability, maintenance] = await Promise.all([
          api.get<{ venue: Venue }>(`/api/venues/${venue.id}`),
          api.get<{ blocks: AvailabilityBlock[] }>(`/api/venue-availability-maintenance/availability/venues/${venue.id}`),
          api.get<{ blocks: MaintenanceBlock[] }>(`/api/venue-availability-maintenance/maintenance/venues/${venue.id}`),
        ]);
        return { ...detail.venue, availabilityBlocks: availability.blocks, maintenanceBlocks: maintenance.blocks };
      }));
      setVenues(detailed);
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

  const createEntrance = async (venueId: string) => {
    const value = entranceNames[venueId]?.trim();
    if (!value) return;
    try {
      await api.post(`/api/venue-entrances/venues/${venueId}/entrances`, { name: value, type: "main", isAccessible: true, isPublic: true });
      setEntranceNames((current) => ({ ...current, [venueId]: "" }));
      toast.success("Entrance added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add entrance");
    }
  };


  const createSeating = async (venueId: string) => {
    const value = seatingNames[venueId]?.trim();
    const capacity = Number(seatingCapacity[venueId]);
    if (!value || !Number.isInteger(capacity) || capacity < 1) return;
    try {
      await api.post(`/api/venue-seating/venues/${venueId}/seating`, { name: value, capacity, type: "fixed", accessibleSeats: 0 });
      setSeatingNames((current) => ({ ...current, [venueId]: "" }));
      setSeatingCapacity((current) => ({ ...current, [venueId]: "" }));
      toast.success("Seating area added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add seating area");
    }
  };

  const createAvailability = async (venueId: string) => {
    const value = availabilityNames[venueId]?.trim();
    const startsAt = availabilityStarts[venueId];
    const endsAt = availabilityEnds[venueId];
    if (!value || !startsAt || !endsAt) return;
    try {
      await api.post(`/api/venue-availability-maintenance/availability/venues/${venueId}`, { name: value, type: "closed", startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() });
      setAvailabilityNames((current) => ({ ...current, [venueId]: "" }));
      setAvailabilityStarts((current) => ({ ...current, [venueId]: "" }));
      setAvailabilityEnds((current) => ({ ...current, [venueId]: "" }));
      toast.success("Availability block added");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to add availability block"); }
  };

  const createMaintenance = async (venueId: string) => {
    const title = maintenanceTitles[venueId]?.trim();
    const startsAt = maintenanceStarts[venueId];
    const endsAt = maintenanceEnds[venueId];
    if (!title || !startsAt || !endsAt) return;
    try {
      await api.post(`/api/venue-availability-maintenance/maintenance/venues/${venueId}`, { title, type: "inspection", startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() });
      setMaintenanceTitles((current) => ({ ...current, [venueId]: "" }));
      setMaintenanceStarts((current) => ({ ...current, [venueId]: "" }));
      setMaintenanceEnds((current) => ({ ...current, [venueId]: "" }));
      toast.success("Maintenance scheduled");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to schedule maintenance"); }
  };

  const createFacility = async (venueId: string) => {
    const value = facilityNames[venueId]?.trim();
    if (!value) return;
    try {
      await api.post(`/api/venue-facilities/venues/${venueId}/facilities`, { name: value, type: "other", quantity: 1, isAccessible: true, isPublic: true });
      setFacilityNames((current) => ({ ...current, [venueId]: "" }));
      toast.success("Facility added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add facility");
    }
  };

  const createParking = async (venueId: string) => {
    const value = parkingNames[venueId]?.trim();
    const totalSpaces = Number(parkingCapacity[venueId]);
    if (!value || !Number.isInteger(totalSpaces) || totalSpaces < 1) return;
    try {
      await api.post(`/api/venue-parking/venues/${venueId}/parking`, { name: value, totalSpaces, type: "surface" });
      setParkingNames((current) => ({ ...current, [venueId]: "" }));
      setParkingCapacity((current) => ({ ...current, [venueId]: "" }));
      toast.success("Parking area added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add parking area");
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


              <div className="mt-4 rounded-lg border p-4">
                <div className="flex items-center gap-2 font-medium"><CarFront className="w-4 h-4" />Parking</div>
                <div className="mt-2 space-y-1">
                  {venue.parkingAreas.length === 0 ? <p className="text-xs text-muted-foreground">No parking areas yet.</p> : venue.parkingAreas.map((parking) => (
                    <div key={parking.id} className="text-sm text-muted-foreground">
                      {parking.name} <span className="text-xs">({parking.type.replace("_", " ")})</span> — {parking.totalSpaces} spaces
                      {parking.accessibleSpaces > 0 ? `, ${parking.accessibleSpaces} accessible` : ""}
                      {parking.evChargingSpaces > 0 ? `, ${parking.evChargingSpaces} EV` : ""}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input disabled={!canManage} value={parkingNames[venue.id] || ""} onChange={(event) => setParkingNames((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Parking area name" />
                  <Input disabled={!canManage} type="number" min={1} value={parkingCapacity[venue.id] || ""} onChange={(event) => setParkingCapacity((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Spaces" className="w-28" />
                  <Button disabled={!canManage} variant="outline" onClick={() => void createParking(venue.id)}>Add Parking</Button>
                </div>
              </div>

              <div className="mt-4 rounded-lg border p-4">
                <div className="flex items-center gap-2 font-medium"><Building2 className="w-4 h-4" />Seating</div>
                <div className="mt-2 space-y-1">
                  {venue.seatingAreas.length === 0 ? <p className="text-xs text-muted-foreground">No seating areas yet.</p> : venue.seatingAreas.map((seat) => (
                    <div key={seat.id} className="text-sm text-muted-foreground">{seat.name} <span className="text-xs">({seat.type.replace("_", " ")})</span> — {seat.capacity} seats{seat.accessibleSeats > 0 ? `, ${seat.accessibleSeats} accessible` : ""}</div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input disabled={!canManage} value={seatingNames[venue.id] || ""} onChange={(event) => setSeatingNames((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Seating area name" />
                  <Input disabled={!canManage} type="number" min={1} value={seatingCapacity[venue.id] || ""} onChange={(event) => setSeatingCapacity((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Seats" className="w-24" />
                  <Button disabled={!canManage} variant="outline" onClick={() => void createSeating(venue.id)}>Add Seating</Button>
                </div>
              </div>

              <div className="mt-4 rounded-lg border p-4">
                <div className="flex items-center gap-2 font-medium"><Building2 className="w-4 h-4" />Facilities</div>
                <div className="mt-2 space-y-1">
                  {venue.facilities.length === 0 ? <p className="text-xs text-muted-foreground">No facilities yet.</p> : venue.facilities.map((facility) => (
                    <div key={facility.id} className="text-sm text-muted-foreground">
                      {facility.name} <span className="text-xs">({facility.type.replace("_", " ")})</span> — {facility.quantity}
                      {facility.isAccessible ? ", accessible" : ""}
                      {facility.isPublic ? ", public" : ""}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input disabled={!canManage} value={facilityNames[venue.id] || ""} onChange={(event) => setFacilityNames((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Facility name" />
                  <Button disabled={!canManage} variant="outline" onClick={() => void createFacility(venue.id)}>Add Facility</Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="font-medium">Availability</div>
                  <div className="mt-2 space-y-1">
                    {venue.availabilityBlocks.length === 0 ? <p className="text-xs text-muted-foreground">No availability blocks.</p> : venue.availabilityBlocks.map((block) => (
                      <div key={block.id} className="text-sm text-muted-foreground">{block.name} — {block.type.replace("_", " ")} · {new Date(block.startsAt).toLocaleString()} to {new Date(block.endsAt).toLocaleString()}</div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <Input disabled={!canManage} value={availabilityNames[venue.id] || ""} onChange={(event) => setAvailabilityNames((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Closure / unavailable reason" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input disabled={!canManage} type="datetime-local" value={availabilityStarts[venue.id] || ""} onChange={(event) => setAvailabilityStarts((current) => ({ ...current, [venue.id]: event.target.value }))} />
                      <Input disabled={!canManage} type="datetime-local" value={availabilityEnds[venue.id] || ""} onChange={(event) => setAvailabilityEnds((current) => ({ ...current, [venue.id]: event.target.value }))} />
                    </div>
                    <Button disabled={!canManage} variant="outline" onClick={() => void createAvailability(venue.id)}>Add Availability Block</Button>
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="font-medium">Maintenance</div>
                  <div className="mt-2 space-y-1">
                    {venue.maintenanceBlocks.length === 0 ? <p className="text-xs text-muted-foreground">No maintenance scheduled.</p> : venue.maintenanceBlocks.map((block) => (
                      <div key={block.id} className="text-sm text-muted-foreground">{block.title} — {block.status.replace("_", " ")} · {new Date(block.startsAt).toLocaleString()} to {new Date(block.endsAt).toLocaleString()}</div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <Input disabled={!canManage} value={maintenanceTitles[venue.id] || ""} onChange={(event) => setMaintenanceTitles((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Maintenance title" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input disabled={!canManage} type="datetime-local" value={maintenanceStarts[venue.id] || ""} onChange={(event) => setMaintenanceStarts((current) => ({ ...current, [venue.id]: event.target.value }))} />
                      <Input disabled={!canManage} type="datetime-local" value={maintenanceEnds[venue.id] || ""} onChange={(event) => setMaintenanceEnds((current) => ({ ...current, [venue.id]: event.target.value }))} />
                    </div>
                    <Button disabled={!canManage} variant="outline" onClick={() => void createMaintenance(venue.id)}>Schedule Maintenance</Button>
                  </div>
                </div>
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
