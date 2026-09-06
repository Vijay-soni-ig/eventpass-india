import { useEffect, useRef, useState } from "react";
import { Building2, Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { useBusiness, useUpdateBusiness, useUploadLogo } from "@/hooks/exhibitor/useBusiness";

export default function CompanyProfile() {
  const { data: business, isLoading } = useBusiness();
  const updateBusiness = useUpdateBusiness();
  const uploadLogo = useUploadLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    companyName: "",
    businessType: "",
    address: "",
    gst: "",
    pan: "",
    website: "",
  });

  useEffect(() => {
    if (business) {
      setFormData({
        companyName: business.companyName ?? "",
        businessType: business.businessType ?? "",
        address: business.address ?? "",
        gst: business.gst ?? "",
        pan: business.pan ?? "",
        website: business.website ?? "",
      });
    }
  }, [business]);

  const items = [
    { label: "Basic Info", done: !!formData.companyName },
    { label: "Address", done: !!formData.address },
    { label: "Logo Upload", done: !!business?.logoUrl },
  ];
  const completion = Math.round((items.filter((i) => i.done).length / items.length) * 100);

  const handleSave = () => {
    updateBusiness.mutate(formData, {
      onSuccess: () => toast.success("Profile updated successfully"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update profile"),
    });
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo.mutate(file, {
      onSuccess: () => toast.success("Logo uploaded"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload logo"),
    });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Company Profile</h1>
          <p className="text-muted-foreground">Manage your company information and branding</p>
        </div>
        <StatusBadge status={business?.kycStatus ?? "pending"} />
      </div>

      {/* Progress Card */}
      <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-6">
        <ProgressRing value={completion} size={100} />
        <div className="flex-1">
          <h3 className="font-semibold mb-2">Profile Completion</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Complete your profile to enable all features including payouts.
          </p>
          <div className="flex gap-4 text-sm flex-wrap">
            {items.map((item) => (
              <span
                key={item.label}
                className={`flex items-center gap-1.5 ${item.done ? "" : "text-muted-foreground"}`}
              >
                {item.done ? <Check className="w-4 h-4 text-success" /> : "○"} {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <h3 className="font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Business Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">Company Name *</Label>
            <Input
              id="name"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Business Type *</Label>
            <Select
              value={formData.businessType}
              onValueChange={(v) => setFormData({ ...formData, businessType: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Private Limited">Private Limited</SelectItem>
                <SelectItem value="LLP">LLP</SelectItem>
                <SelectItem value="Proprietorship">Proprietorship</SelectItem>
                <SelectItem value="Partnership">Partnership</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">Business Address *</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gst">GST Number *</Label>
            <Input
              id="gst"
              value={formData.gst}
              onChange={(e) => setFormData({ ...formData, gst: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pan">PAN Number *</Label>
            <Input
              id="pan"
              value={formData.pan}
              onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            />
          </div>
        </div>

        {/* Logo Upload */}
        <div className="border-t border-border pt-6">
          <h3 className="font-semibold mb-4">Brand Assets</h3>
          <div className="flex items-start gap-6">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-secondary/50 overflow-hidden">
              {business?.logoUrl ? (
                <img src={business.logoUrl} alt="Logo" className="w-full h-full object-contain rounded-xl" />
              ) : (
                <Upload className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium mb-1">Company Logo</p>
              <p className="text-sm text-muted-foreground mb-3">
                Upload a logo for your company. PNG or JPG, max 2MB.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleLogoSelect}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLogo.isPending}
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploadLogo.isPending ? "Uploading..." : "Upload Logo"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() =>
            setFormData({
              companyName: business?.companyName ?? "",
              businessType: business?.businessType ?? "",
              address: business?.address ?? "",
              gst: business?.gst ?? "",
              pan: business?.pan ?? "",
              website: business?.website ?? "",
            })
          }
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isLoading || updateBusiness.isPending}>
          {updateBusiness.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
