/**
 * ExhibitTix knowledge retrieval — milestone 1.
 *
 * This is a small, deterministic baseline over explicitly curated repository
 * documentation. It is intentionally not an LLM and must not be presented as
 * a production AI answer engine. The next milestone can replace lexical
 * retrieval with embeddings while preserving this source/evidence contract.
 */
export type ExhibitTixKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  sourcePath: string;
  sourceLabel: string;
};

export type ExhibitTixKnowledgeMatch = ExhibitTixKnowledgeEntry & {
  score: number;
};

const KNOWLEDGE: ExhibitTixKnowledgeEntry[] = [
  {
    id: "product-overview",
    title: "Product overview",
    sourcePath: "README.md",
    sourceLabel: "ExhibitTix repository README",
    content:
      "ExhibitTix is an exhibition and event management platform designed to connect organizers, exhibitors, and visitors through one operational ecosystem. The documented lifecycle covers event setup, venue and hall management, stall booking, ticketing, QR check-in, lead capture, and analytics.",
  },
  {
    id: "organizer-workflows",
    title: "Organizer workflows",
    sourcePath: "README.md",
    sourceLabel: "ExhibitTix repository README",
    content:
      "The documented organizer role includes creating and managing events, venues, halls, stall layouts, stall pricing, exhibitors, bookings, tickets, check-ins, leads, team members, notifications, refunds where supported, and analytics.",
  },
  {
    id: "exhibitor-workflows",
    title: "Exhibitor workflows",
    sourcePath: "README.md",
    sourceLabel: "ExhibitTix repository README",
    content:
      "The documented exhibitor role includes managing a company profile, exhibition applications, stall bookings, payments, invoices, representatives, visitor leads, follow-ups, and performance analytics.",
  },
  {
    id: "visitor-ticketing",
    title: "Visitor ticketing and check-in",
    sourcePath: "README.md",
    sourceLabel: "ExhibitTix repository README",
    content:
      "The documented visitor journey includes discovering events, registration, purchasing tickets, receiving QR tickets, managing tickets, and checking in at events. Check-in validation must verify ticket existence, event association, payment and validity state, cancellation or refund state, and prior check-in.",
  },
  {
    id: "payment-integrity",
    title: "Payment integrity",
    sourcePath: "README.md",
    sourceLabel: "ExhibitTix repository README",
    content:
      "ExhibitTix payment architecture requires server-side verification and does not treat frontend payment success as authoritative. Documented controls include webhook signature verification, idempotency, duplicate-attempt handling, pending and failed states, refunds where supported, reconciliation, and auditability.",
  },
  {
    id: "security-and-tenant-isolation",
    title: "Security and tenant isolation",
    sourcePath: "README.md",
    sourceLabel: "ExhibitTix repository README",
    content:
      "ExhibitTix documents role-based access control and tenant isolation. Organizer-owned data must not be accessible across unauthorized tenants. Authorization must be enforced on the server, not only through frontend visibility. Sensitive credentials and production database access must not be committed to source control.",
  },
  {
    id: "readiness-caveat",
    title: "Product readiness caveat",
    sourcePath: "README.md",
    sourceLabel: "ExhibitTix repository README",
    content:
      "The repository README states that ExhibitTix is under active production-readiness work. Individual features must be described according to their verified status; repository documentation alone is not proof that a feature is currently deployed, enabled, or production-ready.",
  },
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "do", "does", "for",
  "from", "how", "i", "in", "is", "it", "of", "on", "or", "our", "the",
  "to", "we", "what", "when", "where", "which", "with", "you", "your",
]);

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase("en")
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [];
}

/**
 * Search the curated baseline with simple token overlap.
 * Scores are ranking hints, not probabilities or confidence estimates.
 */
export function searchExhibitTixKnowledge(
  query: string,
  options: { limit?: number; minimumScore?: number } = {},
): ExhibitTixKnowledgeMatch[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const queryTokens = [...new Set(tokenize(normalizedQuery))];
  if (queryTokens.length === 0) return [];

  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 3), 10));
  const minimumScore = Math.max(0, Math.min(options.minimumScore ?? 0.2, 1));

  return KNOWLEDGE
    .map((entry) => {
      const entryTokens = new Set(tokenize(entry.title + " " + entry.content));
      const matchedTokens = queryTokens.filter((token) => entryTokens.has(token));
      const score = matchedTokens.length / queryTokens.length;
      return { ...entry, score };
    })
    .filter((match) => match.score >= minimumScore)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((match) => ({ ...match, score: Number(match.score.toFixed(3)) }));
}

/** Expose a safe summary for health checks and tests, not the whole corpus. */
export function getExhibitTixKnowledgeStats(): { entryCount: number } {
  return { entryCount: KNOWLEDGE.length };
}
