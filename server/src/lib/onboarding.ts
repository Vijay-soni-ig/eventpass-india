import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { getRoleContext, type RoleContext } from "./access";
import { getPublishedFloorPlans } from "./floorPlanQueries";

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
      select: {
        id: true,
        name: true,
        businessType: true,
        address: true,
        city: true,
        state: true,
        country: true,
        description: true,
        logoUrl: true,
        coverImageUrl: true,
        website: true,
        slug: true,
        publicProfileEnabled: true,
        discoverySource: true,
        eventFrequency: true,
        averageEventSize: true,
      },
    });

    if (!organizer) {
      return {
        required: true,
        role: "organizer",
        completed: false,
        percent: 0,
        nextStepKey: "organization-profile",
        steps: [],
      };
    }

    const profileComplete = Boolean(
      organizer.name &&
      organizer.name.trim().length >= 2 &&
      organizer.businessType &&
      organizer.address &&
      organizer.city &&
      organizer.state &&
      organizer.country
    );

    const brandingComplete = Boolean(
      organizer.description &&
      organizer.description.trim().length >= 20 &&
      organizer.logoUrl
    );

    const experienceComplete = Boolean(
      organizer.discoverySource &&
      organizer.eventFrequency &&
      organizer.averageEventSize
    );

    const organizerPageComplete = Boolean(
      organizer.slug &&
      organizer.publicProfileEnabled
    );

    return summary("organizer", [
      {
        key: "organization-profile",
        title: "Tell us about your organization",
        description: "Add your organization identity, business type, location, and contact details.",
        href: "/onboarding?step=0",
        required: true,
        completed: profileComplete,
      },
      {
        key: "organization-branding",
        title: "Build your organizer brand",
        description: "Add your logo, description, website, and visual identity so your organization looks professional.",
        href: "/onboarding?step=1",
        required: true,
        completed: brandingComplete,
      },
      {
        key: "organizer-experience",
        title: "Tell us about your events",
        description: "Help ExhibitTix understand your event experience so we can tailor your organizer workspace.",
        href: "/onboarding?step=2",
        required: false,
        completed: experienceComplete,
      },
      {
        key: "organizer-page",
        title: "Create your organizer page",
        description: "Choose your public profile URL and publish your organizer page for visitors to discover.",
        href: "/onboarding?step=3",
        required: true,
        completed: organizerPageComplete,
      },
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
