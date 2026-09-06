import {
  Users, Store, Mic, Handshake, Award, Zap, Calendar, Ticket, ShieldCheck, Building2, Sparkles,
} from "lucide-react";

// Same controlled icon allow-list the backend validates iconKey against
// (routes/exhibitionContent.ts) — an organizer can only ever have stored one
// of these keys, so this map is exhaustive; `Sparkles` is only ever used as
// the no-icon-set fallback, never itself a storable key.
const ICON_MAP: Record<string, typeof Users> = {
  users: Users, store: Store, mic: Mic, handshake: Handshake, award: Award,
  zap: Zap, calendar: Calendar, ticket: Ticket, "shield-check": ShieldCheck, building2: Building2,
};

interface Highlight {
  id: string;
  title: string;
  description: string | null;
  iconKey: string | null;
}

// Phase 25 — organizer-entered content (ExhibitionHighlight), never
// generated from category/description. Renders nothing if the organizer
// hasn't added any, per the "don't show empty sections" rule.
export function WhatToExpect({ highlights }: { highlights: Highlight[] | undefined }) {
  const items = (highlights ?? []).filter((h) => h.title);
  if (items.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-4">What to Expect</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((item) => {
          const Icon = (item.iconKey && ICON_MAP[item.iconKey]) || Sparkles;
          return (
            <div key={item.id} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{item.title}</p>
                {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
