import { useState } from "react";

const COLLAPSE_THRESHOLD = 420;

// Phase 24 — the organizer description is a plain-text database column (no
// rich-text/HTML storage exists anywhere for it — confirmed by schema
// audit), so the only safe way to render it is as plain text. `white-space:
// pre-line` preserves the organizer's own paragraph/line breaks for
// readability without ever parsing the string as HTML — there is nothing
// here to sanitize because nothing here is ever interpreted as markup.
export function AboutExhibition({ description }: { description: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!description) return null;

  const isLong = description.length > COLLAPSE_THRESHOLD;
  const shown = isLong && !expanded ? `${description.slice(0, COLLAPSE_THRESHOLD).trimEnd()}…` : description;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-3">About the Exhibition</h2>
      <p className="text-muted-foreground whitespace-pre-line leading-relaxed max-w-[65ch]">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-sm font-medium text-primary hover:underline mt-2"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}
