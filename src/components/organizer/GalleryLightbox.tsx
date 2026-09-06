import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { OrganizerGalleryMedia } from "@/types/exhibitor";

interface GalleryLightboxProps {
  item: OrganizerGalleryMedia | null;
  onClose: () => void;
}

// Radix Dialog already provides focus trapping, Escape-to-close, and
// aria-modal semantics for free (see src/components/ui/dialog.tsx) — this
// component only needs to supply the image-specific content and a
// meaningful accessible title.
export function GalleryLightbox({ item, onClose }: GalleryLightboxProps) {
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-background">
        <DialogTitle className="sr-only">{item?.caption || "Gallery image"}</DialogTitle>
        {item && (
          <figure className="flex flex-col">
            <img
              src={item.imageUrl}
              alt={item.altText || item.caption || "Organizer gallery image"}
              className="w-full max-h-[75vh] object-contain bg-black"
            />
            {item.caption && (
              <figcaption className="p-4 text-sm text-muted-foreground">{item.caption}</figcaption>
            )}
          </figure>
        )}
      </DialogContent>
    </Dialog>
  );
}
