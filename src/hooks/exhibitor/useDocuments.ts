import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface ExhibitorDocument {
  id: string;
  exhibitorBusinessId: string;
  uploadedByUserId: string | null;
  name: string;
  fileUrl: string;
  createdAt: string;
}

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: () => api.get<{ documents: ExhibitorDocument[] }>("/api/documents").then((r) => r.documents),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
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
