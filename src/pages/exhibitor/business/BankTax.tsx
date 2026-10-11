import { useEffect, useState } from "react";
import { CreditCard, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useBusiness, useUpdateBusiness } from "@/hooks/exhibitor/useBusiness";

export default function BankTax() {
  const { data: business, isLoading } = useBusiness();
  const updateBusiness = useUpdateBusiness();

  const [formData, setFormData] = useState({
    bankAccountName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    taxCategory: "",
    invoicePreference: "",
  });

  useEffect(() => {
    if (business) {
      setFormData({
        bankAccountName: business.bankAccountName ?? "",
        bankAccountNumber: business.bankAccountNumber ?? "",
        bankIfsc: business.bankIfsc ?? "",
        taxCategory: business.taxCategory ?? "",
        invoicePreference: business.invoicePreference ?? "",
      });
    }
  }, [business]);

  const handleSave = () => {
    updateBusiness.mutate(formData, {
      onSuccess: () => toast.success("Bank details updated successfully"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update bank details"),
    });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Bank Setup</h1>
        <p className="text-muted-foreground">Manage your banking and tax details</p>
      </div>

      {/* Payout processing is not available yet; don't imply verification or transfers. */}
      <div className="rounded-xl p-4 flex items-start gap-3 border border-border bg-muted/50 text-sm text-muted-foreground">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <p>
          Payout processing is not available yet. Saving these details does not verify a bank account or initiate a payout.
        </p>
      </div>

      {/* Bank Details */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <h3 className="font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Bank Account Details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="bankAccountName">Account Holder Name</Label>
            <Input
              id="bankAccountName"
              value={formData.bankAccountName}
              onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankAccountNumber">Account Number</Label>
            <Input
              id="bankAccountNumber"
              value={formData.bankAccountNumber}
              onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankIfsc">IFSC Code</Label>
            <Input
              id="bankIfsc"
              value={formData.bankIfsc}
              onChange={(e) => setFormData({ ...formData, bankIfsc: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="taxCategory">Tax Category</Label>
            <Input
              id="taxCategory"
              value={formData.taxCategory}
              onChange={(e) => setFormData({ ...formData, taxCategory: e.target.value })}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="invoicePreference">Invoice Preference</Label>
            <Input
              id="invoicePreference"
              value={formData.invoicePreference}
              onChange={(e) => setFormData({ ...formData, invoicePreference: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() =>
            setFormData({
              bankAccountName: business?.bankAccountName ?? "",
              bankAccountNumber: business?.bankAccountNumber ?? "",
              bankIfsc: business?.bankIfsc ?? "",
              taxCategory: business?.taxCategory ?? "",
              invoicePreference: business?.invoicePreference ?? "",
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
