interface Audience {
  id: string;
  name: string;
  description: string | null;
}

// Phase 25 — organizer-entered audience segments (ExhibitionAudience), never
// inferred from category. Compact chips/list rather than oversized cards,
// per the redesign's "avoid card monotony" direction. Renders nothing if
// the organizer hasn't added any.
export function WhoShouldAttend({ audiences }: { audiences: Audience[] | undefined }) {
  const items = (audiences ?? []).filter((a) => a.name);
  if (items.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-3">Who Should Attend</h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="px-3.5 py-1.5 rounded-full border border-border bg-card text-sm font-medium"
            title={item.description ?? undefined}
          >
            {item.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
