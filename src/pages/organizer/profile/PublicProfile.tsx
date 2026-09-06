import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Globe2, Image as ImageIcon, Link2, Plus, Trash2, Copy, ExternalLink, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import {
  useOrganizerProfile,
  useUpdateOrganizerProfile,
  useUploadOrganizerLogo,
  useUploadOrganizerCover,
  useAddSocialLink,
  useDeleteSocialLink,
} from "@/hooks/organizer/useOrganizerProfile";

const SOCIAL_PLATFORMS = ["instagram", "facebook", "linkedin", "twitter", "youtube", "other"] as const;

export default function PublicProfile() {
  const { user } = useAuth();
  const canManage = hasOrganizerPermission(user?.roles, "organizerProfile:manage");

  const { data: organizer, isLoading } = useOrganizerProfile();
  const updateProfile = useUpdateOrganizerProfile();
  const uploadLogo = useUploadOrganizerLogo();
  const uploadCover = useUploadOrganizerCover();
  const addSocialLink = useAddSocialLink();
  const deleteSocialLink = useDeleteSocialLink();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    slug: "", description: "", website: "", city: "", state: "", country: "",
    publicEmail: "", publicPhone: "", publicProfileEnabled: false,
  });
  const [newSocialPlatform, setNewSocialPlatform] = useState<string>("");
  const [newSocialUrl, setNewSocialUrl] = useState("");

  useEffect(() => {
    if (!organizer) return;
    setForm({
      slug: organizer.slug ?? "",
      description: organizer.description ?? "",
      website: organizer.website ?? "",
      city: organizer.city ?? "",
      state: organizer.state ?? "",
      country: organizer.country ?? "",
      publicEmail: organizer.publicEmail ?? "",
      publicPhone: organizer.publicPhone ?? "",
      publicProfileEnabled: organizer.publicProfileEnabled,
    });
  }, [organizer]);

  if (isLoading) return <LoadingState label="Loading profile..." />;

  if (!organizer) {
    return <p className="text-muted-foreground">No organizer profile found for this account.</p>;
  }

  const handleSave = () => {
    updateProfile.mutate(form, {
      onSuccess: () => toast.success("Profile updated"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update profile"),
    });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo.mutate(file, {
      onSuccess: () => toast.success("Logo updated"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload logo"),
    });
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadCover.mutate(file, {
      onSuccess: () => toast.success("Cover image updated"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload cover image"),
    });
  };

  const handleAddSocialLink = () => {
    if (!newSocialPlatform || !newSocialUrl) {
      toast.error("Select a platform and enter a URL");
      return;
    }
    addSocialLink.mutate(
      { platform: newSocialPlatform, url: newSocialUrl },
      {
        onSuccess: () => {
          setNewSocialPlatform("");
          setNewSocialUrl("");
          toast.success("Social link added");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add social link"),
      }
    );
  };

  const publicUrl = organizer.slug ? `${window.location.origin}/organizers/${organizer.slug}` : null;

  const copyUrl = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Public profile URL copied");
  };

  if (!canManage) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
        <Lock className="w-4 h-4 shrink-0 mt-0.5" />
        <p>You don't have permission to manage this organizer's public profile. Contact an owner or admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Public Profile</h1>
          <p className="text-muted-foreground">Manage how your organization appears to visitors</p>
        </div>
        <div className="flex gap-2">
          {publicUrl && (
            <>
              <Button variant="outline" size="sm" onClick={copyUrl} className="gap-2">
                <Copy className="w-4 h-4" /> Copy URL
              </Button>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2">
                  <ExternalLink className="w-4 h-4" /> Preview
                </Button>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Visibility */}
      <div className="bg-card border border-border rounded-xl p-6 flex items-center justify-between">
        <div>
          <Label htmlFor="public-profile-toggle">Public Profile</Label>
          <p className="text-sm text-muted-foreground">
            {form.publicProfileEnabled ? "Your profile is visible to visitors." : "Your profile is hidden from visitors."}
          </p>
        </div>
        <Switch
          id="public-profile-toggle"
          checked={form.publicProfileEnabled}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, publicProfileEnabled: checked }))}
        />
      </div>

      {/* Branding */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary" />
          Branding
        </h3>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="logo-upload">Logo</Label>
            <div className="flex items-center gap-3">
              {organizer.logoUrl && <img src={organizer.logoUrl} alt={`${organizer.name} logo`} className="w-16 h-16 rounded-lg object-cover border border-border" />}
              <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadLogo.isPending}>
                {uploadLogo.isPending ? "Uploading..." : "Upload Logo"}
              </Button>
              <input
                id="logo-upload"
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleLogoChange}
                aria-label="Upload logo image"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cover-upload">Cover Image</Label>
            <div className="flex items-center gap-3">
              {organizer.coverImageUrl && <img src={organizer.coverImageUrl} alt={`${organizer.name} cover`} className="w-24 h-16 rounded-lg object-cover border border-border" />}
              <Button variant="outline" size="sm" onClick={() => coverInputRef.current?.click()} disabled={uploadCover.isPending}>
                {uploadCover.isPending ? "Uploading..." : "Upload Cover"}
              </Button>
              <input
                id="cover-upload"
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleCoverChange}
                aria-label="Upload cover image"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-primary" />
          Identity &amp; Description
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="profile-slug">Public URL Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/organizers/</span>
              <Input
                id="profile-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                placeholder="your-organization"
              />
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="profile-description">Description</Label>
            <Textarea
              id="profile-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Tell visitors about your organization"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-website">Website</Label>
            <Input id="profile-website" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-city">City</Label>
            <Input id="profile-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-state">State</Label>
            <Input id="profile-state" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-country">Country</Label>
            <Input id="profile-country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Public contact */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold">Public Contact</h3>
        <p className="text-sm text-muted-foreground">
          Separate from your private account contact details — only what you enter here is ever shown to visitors.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="profile-public-email">Public Email</Label>
            <Input id="profile-public-email" type="email" value={form.publicEmail} onChange={(e) => setForm((f) => ({ ...f, publicEmail: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-public-phone">Public Phone</Label>
            <Input id="profile-public-phone" value={form.publicPhone} onChange={(e) => setForm((f) => ({ ...f, publicPhone: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Social links */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          Social Links
        </h3>
        <div className="space-y-2">
          {(organizer.socialLinks ?? []).map((link) => (
            <div key={link.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="font-medium text-sm capitalize">{link.platform}</p>
                <p className="text-xs text-muted-foreground truncate max-w-md">{link.url}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${link.platform} link`}
                onClick={() =>
                  deleteSocialLink.mutate(link.id, {
                    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove link"),
                  })
                }
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="new-social-platform">Platform</Label>
            <Select value={newSocialPlatform} onValueChange={setNewSocialPlatform}>
              <SelectTrigger id="new-social-platform" className="w-40">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {SOCIAL_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex-1 min-w-[200px]">
            <Label htmlFor="new-social-url">URL</Label>
            <Input id="new-social-url" value={newSocialUrl} onChange={(e) => setNewSocialUrl(e.target.value)} placeholder="https://..." />
          </div>
          <Button variant="outline" onClick={handleAddSocialLink} disabled={addSocialLink.isPending} className="gap-2">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
