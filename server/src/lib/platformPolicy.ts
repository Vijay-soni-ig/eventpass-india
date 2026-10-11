import { prisma } from "./prisma";

/**
 * Platform policy defaults are permissive for backward compatibility when the
 * singleton settings row has not yet been created. Once persisted, the
 * platform-admin settings become authoritative for new registrations and
 * Exhibition creation.
 */
export async function isOrganizerRegistrationAllowed(): Promise<boolean> {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { allowOrganizerRegistration: true },
  });
  return settings?.allowOrganizerRegistration ?? true;
}

export async function isExhibitionCreationAllowed(): Promise<boolean> {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { allowExhibitionCreation: true },
  });
  return settings?.allowExhibitionCreation ?? true;
}
