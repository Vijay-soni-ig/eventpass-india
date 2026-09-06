import { useRef, useState } from "react";
import { FileText, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useDocuments, useUploadDocument, useDeleteDocument } from "@/hooks/exhibitor/useDocuments";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission } from "@/lib/permissions";

export default function Documents() {
  const { user } = useAuth();
  const canManage = hasExhibitorPermission(user?.roles, "document:manage");
  const { data: documents = [], isLoading, isError, refetch } = useDocuments();
  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingName, setPendingName] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = pendingName.trim() || file.name;
    uploadDocument.mutate(
      { file, name },
      {
        onSuccess: () => {
          toast.success("Document uploaded");
          setPendingName("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload document"),
      }
    );
    e.target.value = "";
  };

  const handleDelete = (id: string) => {
    deleteDocument.mutate(id, {
      onSuccess: () => toast.success("Document removed"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove document"),
    });
  };

  if (isLoading) return <LoadingState label="Loading documents..." />;
  if (isError) return <ErrorState description="Couldn't load documents." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground">GST certificates, ID proofs, and other verification documents</p>
      </div>

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
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploadDocument.isPending}>
            <Upload className="w-4 h-4 mr-2" />
            {uploadDocument.isPending ? "Uploading..." : "Upload File"}
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents uploaded yet" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {documents.map((doc) => (
            <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-secondary/30">
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 min-w-0 hover:text-primary"
              >
                <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{doc.name}</span>
              </a>
              {canManage && (
                <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
