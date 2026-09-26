import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { usePublicExhibitions } from "@/hooks/usePublicExhibitions";
import { useSaveVisitorPreferences, useVisitorPreferences } from "@/hooks/usePersonalization";
import { toast } from "sonner";

export function VisitorPersonalizationPreferences() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const { data: exhibitions = [] } = usePublicExhibitions();
  const { data: preference } = useVisitorPreferences(Boolean(user && user.userType === "visitor"));
  const save = useSaveVisitorPreferences();

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    exhibitions.forEach((event) => {
      const category = event.category as unknown as { id?: string; name?: string } | null;
      if (category?.id && category.name) map.set(category.id, category.name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1])).slice(0, 12);
  }, [exhibitions]);

  const cities = useMemo(() => {
    return [...new Set(exhibitions.map((event) => event.city?.trim()).filter((city): city is string => Boolean(city)))]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 12);
  }, [exhibitions]);

  useEffect(() => {
    if (!preference) return;
    setSelectedCategories(preference.preferredCategoryIds);
    setSelectedCities(preference.preferredCities);
  }, [preference]);

  if (!user || user.userType !== "visitor") return null;

  const toggle = (value: string, current: string[], set: (next: string[]) => void, max = 5) => {
    if (current.includes(value)) set(current.filter((item) => item !== value));
    else if (current.length < max) set([...current, value]);
  };

  const submit = () => {
    save.mutate({ preferredCategoryIds: selectedCategories, preferredCities: selectedCities }, {
      onSuccess: () => { toast.success("Your event preferences were updated."); setOpen(false); },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save preferences."),
    });
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Sparkles className="w-4 h-4" aria-hidden="true" /> Personalize
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Personalize your events</DialogTitle>
            <DialogDescription>Choose a few interests and cities. ExhibitTix will use them to improve your recommendations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <h3 className="text-sm font-semibold mb-3">Interests</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categories.map(([id, name]) => (
                  <label key={id} className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                    <Checkbox checked={selectedCategories.includes(id)} onCheckedChange={() => toggle(id, selectedCategories, setSelectedCategories)} />
                    <span className="text-sm">{name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Cities</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cities.map((city) => (
                  <label key={city} className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                    <Checkbox checked={selectedCities.includes(city)} onCheckedChange={() => toggle(city, selectedCities, setSelectedCities)} />
                    <span className="text-sm">{city}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>Save preferences</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
