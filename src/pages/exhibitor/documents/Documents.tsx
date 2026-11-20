import { useEffect, useRef, useState } from "react";
import { FileText, Upload, Trash2, RotateCcw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useDocuments, useUploadDocument, useDeleteDocument, useRestoreDocument, useSubmitExhibitorKyc, type ExhibitorDocument } from "@/hooks/exhibitor/useDocuments";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/apiClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hasExhibitorPermission, hasExhibitorPermissionForBusiness } from "@/lib/permissions";

export default function Documents() {
  const { user } = useAuth();
  const businessQuery = useBusiness();
  const [showArchived, setShowArchived] = useState(false);
  const { data: documents = [], isLoading, isError, refetch } = useDocuments(
    !businessQuery.isLoading && !businessQuery.isError && !businessQuery.isSelectionRequired,
    showArchived
  );
  const hasAnyDocumentManagePermission = hasExhibitorPermission(user?.roles, "document:manage");
  const canManage = hasExhibitorPermissionForBusiness(user?.roles, businessQuery.data?.id, "document:manage");
  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();
  const restoreDocument = useRestoreDocument();
  const submitKyc = useSubmitExhibitorKyc();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingName, setPendingName] = useState("");
  const [pendingCategory, setPendingCategory] = useState<ExhibitorDocument["category"]>("general");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<ExhibitorDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const handlePreview = async (doc: ExhibitorDocument) => {
    setPreviewDocument(doc); setPreviewUrl(null); setPreviewError(null); setPreviewLoading(true);
    try {
      const blob = await api.download(`/api/documents/${encodeURIComponent(doc.id)}/download?businessId=${encodeURIComponent(doc.exhibitorBusinessId)}&includeArchived=${Boolean(doc.archivedAt)}`);
      const contentType = blob.type.split(";")[0].trim().toLowerCase();
      if (contentType !== "application/pdf" && !contentType.startsWith("image/")) throw new Error("Preview is available only for PDF and image documents. Download the file to open it.");
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) { setPreviewError(err instanceof Error ? err.message : "Failed to load document preview"); }
    finally { setPreviewLoading(false); }
  };
  const closePreview = () => { setPreviewDocument(null); setPreviewUrl(null); setPreviewError(null); };
  const isPreviewImage = previewDocument ? /\.(png|jpe?g|webp)$/i.test(previewDocument.name) : false;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = pendingName.trim() || file.name;
    uploadDocument.mutate(
      { file, name, category: pendingCategory },
      {
        onSuccess: () => {
          toast.success("Document uploaded");
          setPendingName("");
          setPendingCategory("general");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload document"),
      }
    );
    e.target.value = "";
  };

  const handleDownload = async (doc: ExhibitorDocument) => {
    setDownloadingId(doc.id);
    try {
      const blob = await api.download(
        `/api/documents/${encodeURIComponent(doc.id)}/download?businessId=${encodeURIComponent(doc.exhibitorBusinessId)}&includeArchived=${Boolean(doc.archivedAt)}`
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = doc.name || "exhibitor-document";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download document");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRestore = (id: string) => {
    restoreDocument.mutate(id, {
      onSuccess: () => toast.success("Document restored"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to restore document"),
    });
  };

  const handleDelete = (id: string) => {
    deleteDocument.mutate(id, {
      onSuccess: () => toast.success("Document removed"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove document"),
    });
  };

  if (businessQuery.isLoading || isLoading) return <LoadingState label="Loading documents..." />;
  if (businessQuery.isSelectionRequired) {
    return <div className="rounded-xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">Choose an active business from the selector above to view and manage its documents.</div>;
  }
  if (businessQuery.isError) {
    return <ErrorState description="Couldn't resolve the active business." onRetry={() => businessQuery.refetch()} />;
  }
  if (isError) return <ErrorState description="Couldn't load documents." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground">GST certificates, ID proofs, and other verification documents</p>
        <div className="mt-4 flex gap-2" role="group" aria-label="Document status filter">
          <Button size="sm" variant={!showArchived ? "default" : "outline"} onClick={() => setShowArchived(false)}>Active documents</Button>
          <Button size="sm" variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived(true)}>Archived documents</Button>
        </div>
      </div>

      {hasAnyDocumentManagePermission && businessQuery.data && !canManage && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground">
          You do not have document-management permission for the selected business. Choose a business where you are an owner or administrator.
        </div>
      )}
      {canManage && (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="space-y-1.5 flex-1 w-full">
            <label className="text-xs text-muted-foreground">Document name (optional)</label>
            <Input
              placeholder="e.g., GST Certificate"
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 w-full sm:w-56">
            <label className="text-xs text-muted-foreground" htmlFor="document-category">Document category</label>
            <select id="document-category" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={pendingCategory} onChange={(e) => setPendingCategory(e.target.value as ExhibitorDocument["category"])}>
              <option value="general">General document</option><option value="gst_certificate">GST certificate</option><option value="pan_card">PAN card</option><option value="identity_proof">Identity proof</option><option value="authorization_letter">Authorization letter</option><option value="bank_proof">Bank proof</option>
            </select>
          </div>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploadDocument.isPending || businessQuery.isLoading || businessQuery.isError || businessQuery.isSelectionRequired}>
            <Upload className="w-4 h-4 mr-2" />
            {uploadDocument.isPending ? "Uploading..." : "Upload File"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" aria-label="Choose a PDF or image document" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {canManage && businessQuery.data && (
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><p className="font-medium">Exhibitor KYC: {businessQuery.data.kycWorkflowStatus.replace(/_/g, " ")}</p><p className="text-sm text-muted-foreground">Upload categorized documents, then submit them for Super Admin review. Archive a rejected file before uploading its replacement.</p></div>
          <Button onClick={() => submitKyc.mutate(undefined, { onSuccess: () => toast.success("KYC documents submitted for review"), onError: (err) => toast.error(err instanceof Error ? err.message : "KYC submission failed") })} disabled={submitKyc.isPending || !documents.some((doc) => !doc.archivedAt && doc.category !== "general" && doc.reviewStatus === "not_submitted")}>{submitKyc.isPending ? "Submitting..." : "Submit KYC for review"}</Button>
        </div>
      )}
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title={showArchived ? "No archived documents" : "No documents uploaded yet"} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {documents.map((doc) => (
            <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-secondary/30">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <button type="button" onClick={() => void handlePreview(doc)} aria-label={`Preview ${doc.name}`} className="min-w-0 text-left hover:text-primary">
                  <span className="block truncate font-medium">{doc.name}</span>
                  <span className="block text-xs text-muted-foreground">{doc.category.replace(/_/g, " ")} · {doc.reviewStatus.replace(/_/g, " ")}</span>
                  {doc.rejectionReason && <span className="block text-xs text-destructive mt-1">Reason: {doc.rejectionReason}</span>
                </button>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Download ${doc.name}`} disabled={downloadingId === doc.id} onClick={() => void handleDownload(doc)}>
                <Download className="w-4 h-4" />
              </Button>
              {canManage && (showArchived ? (
                <Button variant="ghost" size="icon" aria-label={`Restore ${doc.name}`} disabled={restoreDocument.isPending} onClick={() => handleRestore(doc.id)}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" aria-label={`Archive ${doc.name}`} disabled={deleteDocument.isPending} onClick={() => handleDelete(doc.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              ))}
            </div>
          ))}
        </div>
      )}
      <Dialog open={Boolean(previewDocument)} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{previewDocument?.name ?? "Document preview"}</DialogTitle>
            <DialogDescription>Private preview. Access is limited to authorized members of the selected exhibitor business.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-md border bg-muted/20 overflow-hidden flex items-center justify-center">
            {previewLoading && <LoadingState label="Loading preview..." />}
            {!previewLoading && previewError && <div className="p-6 text-center text-sm text-muted-foreground">{previewError}</div>}
            {!previewLoading && !previewError && previewUrl && isPreviewImage && <img src={previewUrl} alt={previewDocument?.name ?? "Document preview"} className="max-h-full max-w-full object-contain" />}
            {!previewLoading && !previewError && previewUrl && !isPreviewImage && <iframe title={previewDocument?.name ?? "PDF preview"} src={previewUrl} className="w-full h-full bg-white" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
