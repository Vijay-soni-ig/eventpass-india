import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getActiveExhibitorBusinessId } from "@/lib/apiClient";

export interface ExhibitorDocument {
  id: string;
  exhibitorBusinessId: string;
  uploadedByUserId: string | null;
  name: string;
  fileUrl: string;
  createdAt: string;
  archivedAt: string | null;
  category: "gst_certificate" | "pan_card" | "identity_proof" | "authorization_letter" | "bank_proof" | "general";
  reviewStatus: "not_required" | "not_submitted" | "pending_review" | "approved" | "rejected";
  rejectionReason: string | null;
}

export function useDocuments(enabled = true, includeArchived = false) {
  const activeBusinessId = getActiveExhibitorBusinessId();
  return useQuery({
    queryKey: ["documents", activeBusinessId, includeArchived],
    queryFn: () => api.get<{ documents: ExhibitorDocument[] }>(`/api/documents?includeArchived=${includeArchived}`).then((r) => r.documents),
    enabled,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name, category }: { file: File; name: string; category: ExhibitorDocument["category"] }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("category", category);
      return api.post<{ document: ExhibitorDocument }>("/api/documents", formData).then((r) => r.document);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useRestoreDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/documents/${encodeURIComponent(id)}/restore`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useSubmitExhibitorKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string; submittedCount: number }>("/api/documents/kyc/submit", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["business"] });
    },
  });
}
