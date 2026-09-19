import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { getRoleContext, type RoleContext } from "./access";
import { getPublishedFloorPlan } from "./floorPlanQueries";

export type OnboardingStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  required: boolean;
  completed: boolean;
};

export type OnboardingSummary = {
  required: boolean;
  role: "organizer" | "exhibitor" | null;
  completed: boolean;
  percent: number;
  nextStepKey: string | null;
  steps: OnboardingStep[];
};

function summary(role: "organizer" | "exhibitor", steps: OnboardingStep[]): OnboardingSummary {
  const requiredSteps = steps.filter((step) => step.required);
  const completedRequired = requiredSteps.filter((step) => step.completed).length;
  const completedCount = steps.filter((step) => step.completed).length;
  const percent = steps.length ? Math.round((completedCount / steps.length) * 100) : 100;
  const next = steps.find((step) => step.required && !step.completed) ?? steps.find((step) => !step.completed) ?? null;

  return {
    required: true,
    role,
    completed: completedRequired === requiredSteps.length,
    percent,
    nextStepKey: next?.key ?? null,
    steps,
  };
}

export async function getOnboardingSummary(user: User, roles: RoleContext): Promise<OnboardingSummary> {
  if (roles.platformAdmin) return { required: false, role: null, completed: true, percent: 100, nextStepKey: null, steps: [] };

  const organizerOwner = roles.organizer.find((membership) => membership.role === "ORGANIZER_OWNER");
  if (user.userType === "organizer" && organizerOwner) {
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerOwner.organizerId },
      select: { id: true, name: true, businessType: true, address: true, city: true, state: true, description: true, logoUrl: true, website: true },
    });
    if (!organizer) return { required: true, role: "organizer", completed: false, percent: 0, nextStepKey: "organization-profile", steps: [] };

    const exhibitions = await prisma.exhibition.findMany({
      where: { organizerId: organizer.id },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { id: true, name: true, category: true, venue: true, city: true, startDate: true, endDate: true },
    });
    const first = exhibitions[0];
    const publishedFloorPlan = first ? await getPublishedFloorPlan(first.id) : null;
    const profileComplete = Boolean(organizer.name && organizer.businessType && organizer.address && organizer.city && organizer.state);
    const brandingComplete = Boolean(organizer.description && (organizer.logoUrl || organizer.website));
    const exhibitionComplete = Boolean(first);
    const basicsComplete = Boolean(first?.name && first.category && (first.venue || first.city) && first.startDate && first.endDate);

    return summary("organizer", [
      { key: "organization-profile", title: "Complete organization profile", description: "Add your organization identity and business details.", href: "/organizer/profile", required: true, completed: profileComplete },
      { key: "organization-branding", title: "Add organization branding", description: "Add a description plus a logo or website so visitors can recognize your organization.", href: "/organizer/profile", required: false, completed: brandingComplete },
      { key: "first-exhibition", title: "Create your first exhibition", description: "Create the exhibition you want to manage on ExhibitTix.", href: "/organizer/exhibitions/new", required: true, completed: exhibitionComplete },
      { key: "exhibition-basics", title: "Complete exhibition basics", description: "Add category, venue, dates, and core event information.", href: first ? `/organizer/exhibitions/${first.id}/details` : "/organizer/exhibitions", required: true, completed: basicsComplete },
      { key: "floor-plan", title: "Configure the exhibition floor plan", description: "Set up and publish the floor plan before accepting exhibitor bookings.", href: first ? `/organizer/exhibitions/${first.id}/floor-plan` : "/organizer/exhibitions", required: true, completed: Boolean(publishedFloorPlan) },
    ]);
  }

  const exhibitorOwner = roles.exhibitor.find((membership) => membership.role === "EXHIBITOR_OWNER");
  if (user.userType === "exhibitor") {
    const business = exhibitorOwner
      ? await prisma.exhibitorBusiness.findUnique({
          where: { id: exhibitorOwner.exhibitorBusinessId },
          select: { id: true, companyName: true, businessType: true, address: true, website: true, logoUrl: true, gst: true, pan: true, taxCategory: true, invoicePreference: true },
        })
      : null;
    const participation = exhibitorOwner
      ? await prisma.exhibitionExhibitor.findFirst({
          where: {
            exhibitorBusinessId: exhibitorOwner.exhibitorBusinessId,
            status: { notIn: ["rejected", "cancelled"] },
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            stalls: { select: { id: true }, take: 1 },
            stallBookings: {
              select: {
                paymentStatus: true,
                payment: { select: { status: true } },
              },
              take: 1,
            },
          },
        })
      : null;
    const documentCount = exhibitorOwner
      ? await prisma.document.count({ where: { exhibitorBusinessId: exhibitorOwner.exhibitorBusinessId } })
      : 0;

    const profileComplete = Boolean(business?.companyName && business.businessType && business.address);
    const brandingComplete = Boolean(business?.logoUrl || business?.website);
    const billingComplete = Boolean(
      business?.gst || business?.pan || business?.taxCategory || business?.invoicePreference
    );
    const participationStarted = Boolean(participation);
    const stallSelected = Boolean(participation?.stalls.length);
    const paymentComplete = Boolean(
      participation?.status === "confirmed" ||
        participation?.stallBookings.some(
          (booking) => booking.paymentStatus === "paid" || booking.payment?.status === "paid"
        )
    );

    return summary("exhibitor", [
      { key: "company-profile", title: "Complete company profile", description: "Tell organizers who you are and what your business does.", href: "/exhibitor-dashboard/business/profile", required: true, completed: profileComplete },
      { key: "company-branding", title: "Add company branding", description: "Add your logo or website so your company profile is recognizable.", href: "/exhibitor-dashboard/business/profile", required: false, completed: brandingComplete },
      { key: "billing-tax", title: "Complete billing and tax details", description: "Add the GST, PAN, tax category, or invoice preference needed for your business and invoices.", href: "/exhibitor-dashboard/business/bank", required: true, completed: billingComplete },
      { key: "business-documents", title: "Upload business documents", description: "Upload verification documents such as GST certificates or other required business records.", href: "/exhibitor-dashboard/documents", required: false, completed: documentCount > 0 },
      { key: "first-participation", title: "Apply to an exhibition", description: "Browse available exhibitions and start your first participation.", href: "/exhibitions", required: true, completed: participationStarted },
      { key: "stall-selection", title: "Select your exhibition stall", description: "After organizer approval, choose an available stall from the exhibition floor plan.", href: "/exhibitor-dashboard/participations", required: true, completed: stallSelected },
      { key: "stall-payment", title: "Complete stall payment", description: "Finish the stall payment and wait for server-side payment verification before the participation is confirmed.", href: "/exhibitor-dashboard/participations", required: true, completed: paymentComplete },
    ]);
  }

  return { required: false, role: null, completed: true, percent: 100, nextStepKey: null, steps: [] };
}
