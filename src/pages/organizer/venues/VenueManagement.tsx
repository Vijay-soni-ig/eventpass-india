import { useEffect, useState } from "react";
import { Building2, Plus, MapPin, Layers3, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import { api } from "@/lib/apiClient";

type Floor = { id: string; name: string; code: string | null; level: number; status: string };
type Building = { id: string; name: string; code: string | null; status: string; floors: Floor[] };
type Venue = { id: string; name: string; code: string | null; city: string | null; state: string | null; status: string; buildings: Building[] };

export default function VenueManagement() {
  const { user } = useAuth();
  const canManage = hasOrganizerPermission(user?.roles, "venue:manage");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [buildingNames, setBuildingNames] = useState<Record<string, string>>({});
  const [floorNames, setFloorNames] = useState<Record<string, string>>({});

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
      await api.post(`/api/venues/buildings/${buildingId}/floors`, {
        name: value,
        level: currentFloors.length,
      });
      setFloorNames((current) => ({ ...current, [buildingId]: "" }));
      toast.success("Floor added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add floor");
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

  if (!canManage) {
    return <EmptyState icon={Building2} title="Venue management access required" description="Your organizer role does not have permission to manage venues." />;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Venues</h1>
        <p className="text-muted-foreground">Manage reusable venues, buildings and floors for your organization.</p>
      </div>

      <div className="flex gap-3 max-w-xl">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Venue name" onKeyDown={(event) => { if (event.key === "Enter") void createVenue(); }} />
        <Button onClick={() => void createVenue()}><Plus className="w-4 h-4 mr-2" />Add Venue</Button>
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
                <Button variant="ghost" size="icon" aria-label={venue.status === "archived" ? "Restore venue" : "Archive venue"} onClick={() => void (venue.status === "archived" ? restoreVenue(venue.id) : archiveVenue(venue.id))}>
                  {venue.status === "archived" ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>

              <div className="mt-5 space-y-4">
                {venue.buildings.map((building) => (
                  <div key={building.id} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 font-medium"><Building2 className="w-4 h-4" />{building.name}</div>
                    <div className="mt-3 space-y-2">
                      {building.floors.map((floor) => (
                        <div key={floor.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Layers3 className="w-4 h-4" />{floor.name}<span>Level {floor.level}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Input value={floorNames[building.id] || ""} onChange={(event) => setFloorNames((current) => ({ ...current, [building.id]: event.target.value }))} placeholder="Floor name" />
                      <Button variant="outline" onClick={() => void createFloor(building.id, building.floors)}>Add Floor</Button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Input value={buildingNames[venue.id] || ""} onChange={(event) => setBuildingNames((current) => ({ ...current, [venue.id]: event.target.value }))} placeholder="Building name" />
                  <Button variant="outline" onClick={() => void createBuilding(venue.id)}>Add Building</Button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
