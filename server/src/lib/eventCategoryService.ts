import { prisma } from "./prisma";

/**
 * ETX-EVENT-001C — cycle prevention for EventCategory's self-referencing
 * parent/child tree. EventCategory.parent uses onDelete: Restrict (schema),
 * which stops a parent with children from being deleted — it does nothing
 * to stop a PATCH from setting parentCategoryId to create a cycle
 * (A -> B -> C -> A). No existing self-referencing-tree validation exists
 * elsewhere in this codebase to reuse, so this is new, narrowly-scoped logic.
 *
 * Walks upward from `candidateParentId` following `parentCategoryId` and
 * fails if `categoryId` itself is encountered — which would mean the
 * category is being made an ancestor of itself. Also rejects
 * candidateParentId === categoryId (a category cannot be its own parent).
 * Bounded by a hard depth cap so a pre-existing data corruption elsewhere
 * can never turn this into an infinite loop.
 */
export class CategoryCycleError extends Error {
  constructor() {
    super("This would create a cycle in the category hierarchy");
  }
}

const MAX_DEPTH = 100;

export async function assertNoCategoryCycle(categoryId: string, candidateParentId: string | null): Promise<void> {
  if (candidateParentId === null) return;
  if (candidateParentId === categoryId) throw new CategoryCycleError();

  let currentId: string | null = candidateParentId;
  for (let depth = 0; depth < MAX_DEPTH && currentId; depth++) {
    if (currentId === categoryId) throw new CategoryCycleError();
    const current: { parentCategoryId: string | null } | null = await prisma.eventCategory.findUnique({
      where: { id: currentId },
      select: { parentCategoryId: true },
    });
    currentId = current?.parentCategoryId ?? null;
  }
}
