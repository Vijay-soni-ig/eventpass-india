import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface MediaItem {
  id: string;
  imageUrl: string;
  altText: string | null;
  caption: string | null;
}

// Phase 25 — organizer-uploaded gallery (ExhibitionMedia). A single image
// renders as a plain image with no gallery chrome at all (per the "don't
// build a gallery UI for one photo" rule); 2+ images get a main image +
// thumbnail strip and a keyboard/swipe-friendly lightbox. Radix Dialog
// (already used elsewhere in this app) supplies Escape-to-close and focus
// trapping for free, so the lightbox itself is only the image/nav layer.
export function EventGallery({ media, exhibitionName }: { media: MediaItem[] | undefined; exhibitionName: string }) {
  const items = media ?? [];
  const [mainIndex, setMainIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i + 1) % items.length);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen, items.length]);

  if (items.length === 0) return null;

  const altFor = (item: MediaItem) => item.altText || `${exhibitionName} — photo`;

  if (items.length === 1) {
    return (
      <div>
        <h2 className="font-display text-xl font-semibold mb-3">Gallery</h2>
        <div className="aspect-video rounded-2xl overflow-hidden bg-muted">
          <img src={items[0].imageUrl} alt={altFor(items[0])} className="w-full h-full object-cover" loading="lazy" />
        </div>
        {items[0].caption && <p className="text-sm text-muted-foreground mt-2">{items[0].caption}</p>}
      </div>
    );
  }

  const openLightbox = (idx: number) => {
    setLightboxIndex(idx);
    setLightboxOpen(true);
  };

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-3">Gallery</h2>
      <button
        type="button"
        onClick={() => openLightbox(mainIndex)}
        className="block w-full aspect-video rounded-2xl overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`View ${altFor(items[mainIndex])} full size`}
      >
        <img src={items[mainIndex].imageUrl} alt={altFor(items[mainIndex])} className="w-full h-full object-cover" loading="lazy" />
      </button>
      {items[mainIndex].caption && <p className="text-sm text-muted-foreground mt-2">{items[mainIndex].caption}</p>}

      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
        {items.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMainIndex(idx)}
            aria-label={`Show photo ${idx + 1} of ${items.length}`}
            aria-current={idx === mainIndex}
            className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
              idx === mainIndex ? "border-primary" : "border-transparent hover:border-border"
            }`}
          >
            <img src={item.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          className="max-w-4xl w-[95vw] p-0 bg-background border-none [&>button]:text-background [&>button]:z-10"
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartX === null) return;
            const delta = e.changedTouches[0].clientX - touchStartX;
            if (delta > 50) setLightboxIndex((i) => (i - 1 + items.length) % items.length);
            else if (delta < -50) setLightboxIndex((i) => (i + 1) % items.length);
            setTouchStartX(null);
          }}
        >
          <div className="relative">
            <img
              src={items[lightboxIndex].imageUrl}
              alt={altFor(items[lightboxIndex])}
              className="w-full max-h-[80vh] object-contain bg-black"
            />
            <button
              type="button"
              onClick={() => setLightboxIndex((i) => (i - 1 + items.length) % items.length)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card/80 flex items-center justify-center hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setLightboxIndex((i) => (i + 1) % items.length)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card/80 flex items-center justify-center hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-background bg-foreground/60 px-2 py-1 rounded-full">
              {lightboxIndex + 1} / {items.length}
            </p>
          </div>
          {items[lightboxIndex].caption && (
            <p className="text-sm text-muted-foreground p-3 text-center">{items[lightboxIndex].caption}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
