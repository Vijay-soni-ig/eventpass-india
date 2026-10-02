import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/apiClient";
import { useCreateHall, useDeleteHall, useUpdateHall, type ExhibitionHall } from "@/hooks/organizer/useFloorPlanLayout";

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

interface HallBarProps {
  exhibitionId: string;
  halls: ExhibitionHall[];
  selectedId: string | undefined;
  onSelect: (hallId: string) => void;
  canEdit: boolean;
}

type NameDialog = { mode: "create" } | { mode: "rename"; hall: ExhibitionHall };

/** Hall switcher for the organizer: pick a hall, add one, rename or delete the selected one. */
export function HallBar({ exhibitionId, halls, selectedId, onSelect, canEdit }: HallBarProps) {
  const createHall = useCreateHall(exhibitionId);
  const updateHall = useUpdateHall(exhibitionId);
  const deleteHall = useDeleteHall(exhibitionId);
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ExhibitionHall | null>(null);
  const selected = halls.find((h) => h.id === selectedId);

  function openCreate() {
    setName("");
    setNameDialog({ mode: "create" });
  }

  function openRename(hall: ExhibitionHall) {
    setName(hall.name);
    setNameDialog({ mode: "rename", hall });
  }

  function submitName(e: React.FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next || !nameDialog) return;
    if (nameDialog.mode === "create") {
      createHall.mutate(next, {
        onSuccess: (hall) => {
          setNameDialog(null);
          onSelect(hall.id);
          toast.success(`Added ${hall.name}. Create its floor plan next.`);
        },
        onError: (err) => toast.error(messageOf(err, "Failed to add the hall")),
      });
    } else {
      if (next === nameDialog.hall.name) {
        setNameDialog(null);
        return;
      }
      updateHall.mutate(
        { hallId: nameDialog.hall.id, name: next },
        {
          onSuccess: () => {
            setNameDialog(null);
            toast.success("Hall renamed");
          },
          onError: (err) => toast.error(messageOf(err, "Failed to rename the hall")),
        }
      );
    }
  }

  const pending = createHall.isPending || updateHall.isPending;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Halls">
        {halls.map((hall) => {
          const isSelected = hall.id === selectedId;
          return (
            <Button
              key={hall.id}
              type="button"
              size="sm"
              role="tab"
              aria-selected={isSelected}
              variant={isSelected ? "secondary" : "outline"}
              onClick={() => onSelect(hall.id)}
            >
              {hall.name}
              {hall.publishedPlanId ? (
                <Badge variant="success" className="ml-2 px-1.5 py-0 text-[10px]">
                  Live
                </Badge>
              ) : hall.draftPlanId ? (
                <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
                  Draft
                </Badge>
              ) : null}
            </Button>
          );
        })}
        {canEdit && (
          <Button type="button" size="sm" variant="ghost" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" />
            Add hall
          </Button>
        )}
        {canEdit && selected && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" aria-label={`Manage ${selected.name}`}>
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => openRename(selected)}>Rename hall</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(selected)}>
                Delete hall
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={!!nameDialog} onOpenChange={(open) => !open && !pending && setNameDialog(null)}>
        <DialogContent className="max-w-sm">
          <form onSubmit={submitName} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{nameDialog?.mode === "rename" ? "Rename hall" : "Add a hall"}</DialogTitle>
              <DialogDescription>
                {nameDialog?.mode === "rename"
                  ? "Visitors and exhibitors see this name on the hall's tab."
                  : "Each hall has its own floor plan, draft and publish. A stall can be placed in one hall at a time."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="hall-name">Hall name</Label>
              <Input id="hall-name" value={name} maxLength={80} autoFocus placeholder="e.g. Hall B" onChange={(e) => setName(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNameDialog(null)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || pending}>
                {pending ? "Saving..." : nameDialog?.mode === "rename" ? "Save" : "Add hall"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the hall and all of its floor plans, including the one visitors see now. Your stalls are kept and can be placed in
              another hall. A hall whose stalls are already reserved or sold can't be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDelete) return;
                deleteHall.mutate(confirmDelete.id, {
                  onSuccess: () => toast.success(`Deleted ${confirmDelete.name}`),
                  onError: (err) => toast.error(messageOf(err, "Failed to delete the hall")),
                });
              }}
            >
              Delete hall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
