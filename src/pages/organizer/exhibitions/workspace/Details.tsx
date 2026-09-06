import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useUpdateExhibition, useUploadCover } from "@/hooks/exhibitor/useExhibitions";
import type { ExhibitionStatus } from "@/types/exhibitor";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

const statusLabels: Record<ExhibitionStatus, string> = {
  draft: "Draft",
  live: "Live",
  paused: "Paused",
  completed: "Completed",
};

export default function Details() {
  const { exhibition, canEdit } = useOutletContext<EventWorkspaceContext>();
  const updateExhibition = useUpdateExhibition();
  const uploadCover = useUploadCover(exhibition.id);

  const [settings, setSettings] = useState({
    name: "",
    category: "",
    description: "",
    venue: "",
    city: "",
    latitude: "",
    longitude: "",
    startDate: "",
    endDate: "",
    status: "draft" as ExhibitionStatus,
    refundPolicy: "",
    terms: "",
  });

  useEffect(() => {
    setSettings({
      name: exhibition.name,
      category: exhibition.category ?? "",
      description: exhibition.description ?? "",
      venue: exhibition.venue ?? "",
      city: exhibition.city ?? "",
      latitude: exhibition.latitude != null ? String(exhibition.latitude) : "",
      longitude: exhibition.longitude != null ? String(exhibition.longitude) : "",
      startDate: exhibition.startDate?.slice(0, 10) ?? "",
      endDate: exhibition.endDate?.slice(0, 10) ?? "",
      status: exhibition.status,
      refundPolicy: exhibition.refundPolicy ?? "",
      terms: exhibition.terms ?? "",
    });
  }, [exhibition]);

  const handleSaveSettings = () => {
    if (!settings.name.trim()) {
      toast.error("Exhibition name is required");
      return;
    }
    if (settings.startDate && settings.endDate && settings.endDate < settings.startDate) {
      toast.error("End date must be after the start date");
      return;
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    if (settings.latitude.trim() || settings.longitude.trim()) {
      latitude = Number(settings.latitude);
      longitude = Number(settings.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        toast.error("Latitude must be a number between -90 and 90");
        return;
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        toast.error("Longitude must be a number between -180 and 180");
        return;
      }
    }

    const { latitude: _lat, longitude: _lng, ...rest } = settings;
    updateExhibition.mutate(
      { id: exhibition.id, ...rest, latitude, longitude },
      {
        onSuccess: () => toast.success("Exhibition updated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update exhibition"),
      }
    );
  };

  const handleCoverUpload = (file: File) => {
    uploadCover.mutate(file, {
      onSuccess: () => toast.success("Cover image uploaded"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload cover image"),
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <Label>Exhibition Name</Label>
          <Input
            value={settings.name}
            onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Input
            value={settings.category}
            onChange={(e) => setSettings({ ...settings, category: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={settings.status}
            onValueChange={(v) => setSettings({ ...settings, status: v as ExhibitionStatus })}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Description</Label>
          <Textarea
            rows={3}
            value={settings.description}
            onChange={(e) => setSettings({ ...settings, description: e.target.value })}
            disabled={!canEdit}
          />
        </div>

        {canEdit && (
          <div className="space-y-2 md:col-span-2">
            <Label>Cover Image</Label>
            <p className="text-xs text-muted-foreground">
              Shown on the event card and detail page — visitors see this before anything else.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" asChild disabled={uploadCover.isPending} type="button">
                <label className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadCover.isPending ? "Uploading..." : "Upload Cover Image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCoverUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              {exhibition.coverImageUrl && <span className="text-sm text-success">Cover image uploaded</span>}
            </div>
            {exhibition.coverImageUrl && (
              <img
                src={exhibition.coverImageUrl}
                alt="Current cover"
                className="mt-2 h-32 rounded-lg object-cover border border-border"
              />
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>City</Label>
          <Input
            value={settings.city}
            onChange={(e) => setSettings({ ...settings, city: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Venue</Label>
          <Input
            value={settings.venue}
            onChange={(e) => setSettings({ ...settings, venue: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Venue Latitude (Optional)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 19.0760"
            value={settings.latitude}
            onChange={(e) => setSettings({ ...settings, latitude: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Venue Longitude (Optional)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 72.8777"
            value={settings.longitude}
            onChange={(e) => setSettings({ ...settings, longitude: e.target.value })}
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground">
            Real venue coordinates power "Events Near You" on the homepage. Leave blank if unknown.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input
            type="date"
            value={settings.startDate}
            onChange={(e) => setSettings({ ...settings, startDate: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>End Date</Label>
          <Input
            type="date"
            value={settings.endDate}
            onChange={(e) => setSettings({ ...settings, endDate: e.target.value })}
            disabled={!canEdit}
          />
        </div>

        <div className="space-y-2">
          <Label>Refund Policy</Label>
          <Textarea
            rows={2}
            value={settings.refundPolicy}
            onChange={(e) => setSettings({ ...settings, refundPolicy: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Terms</Label>
          <Textarea
            rows={2}
            value={settings.terms}
            onChange={(e) => setSettings({ ...settings, terms: e.target.value })}
            disabled={!canEdit}
          />
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSaveSettings} disabled={updateExhibition.isPending}>
            {updateExhibition.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
