import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CityProvider } from "@/hooks/useCityContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExhibitorRoute from "@/components/ExhibitorRoute";
import OrganizerRoute from "@/components/OrganizerRoute";
import PlatformRoute from "@/components/PlatformRoute";
import { DashboardLayout as ExhibitorDashboardLayout } from "@/components/exhibitor/layout/DashboardLayout";
import { DashboardLayout as OrganizerDashboardLayout } from "@/components/organizer/layout/DashboardLayout";
import EventWorkspaceLayout from "@/components/organizer/exhibitions/EventWorkspaceLayout";
import { DashboardLayout as PlatformDashboardLayout } from "@/components/platform/layout/DashboardLayout";
import { Megaphone } from "lucide-react";

const Index = lazy(() => import("./pages/Index"));
const ExhibitionListing = lazy(() => import("./pages/ExhibitionListing"));
const ExhibitionDetail = lazy(() => import("./pages/ExhibitionDetail"));
const OrganizerPublicProfile = lazy(() => import("./pages/OrganizerPublicProfile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const BookingFlow = lazy(() => import("./pages/BookingFlow"));
const StallBookingFlow = lazy(() => import("./pages/StallBookingFlow"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MyTickets = lazy(() => import("./pages/MyTickets"));
const TicketDetail = lazy(() => import("./pages/TicketDetail"));
const ForExhibitors = lazy(() => import("./pages/ForExhibitors"));

const ExhibitorOverview = lazy(() => import("./pages/exhibitor/Dashboard"));
const MyBusiness = lazy(() => import("./pages/exhibitor/business/MyBusiness"));
const CompanyProfile = lazy(() => import("./pages/exhibitor/business/CompanyProfile"));
const BankTax = lazy(() => import("./pages/exhibitor/business/BankTax"));
const TeamRoles = lazy(() => import("./pages/exhibitor/business/TeamRoles"));
const MyParticipations = lazy(() => import("./pages/exhibitor/participations/MyParticipations"));
const PaymentHistory = lazy(() => import("./pages/exhibitor/participations/PaymentHistory"));
const Documents = lazy(() => import("./pages/exhibitor/documents/Documents"));
const Leads = lazy(() => import("./pages/exhibitor/leads/Leads"));
const LeadDetail = lazy(() => import("./pages/exhibitor/leads/LeadDetail"));
const ExhibitionsList = lazy(() => import("./pages/exhibitor/exhibitions/ExhibitionsList"));
const CreateExhibition = lazy(() => import("./pages/exhibitor/exhibitions/CreateExhibition"));
const Sales = lazy(() => import("./pages/exhibitor/sales/Sales"));
const Tickets = lazy(() => import("./pages/exhibitor/tickets/Tickets"));
const Stalls = lazy(() => import("./pages/exhibitor/stalls/Stalls"));
const Attendees = lazy(() => import("./pages/exhibitor/attendees/Attendees"));
const Scanner = lazy(() => import("./pages/exhibitor/scanner/Scanner"));
const Analytics = lazy(() => import("./pages/exhibitor/analytics/Analytics"));
const ExhibitorSettings = lazy(() => import("./pages/exhibitor/settings/Settings"));

const OrganizerDashboard = lazy(() => import("./pages/organizer/Dashboard"));
const OrganizerExhibitionsList = lazy(() => import("./pages/organizer/exhibitions/ExhibitionsList"));
const OrganizerCreateExhibition = lazy(() => import("./pages/organizer/exhibitions/CreateExhibition"));
const EventOverview = lazy(() => import("./pages/organizer/exhibitions/workspace/Overview"));
const EventDetails = lazy(() => import("./pages/organizer/exhibitions/workspace/Details"));
const EventContent = lazy(() => import("./pages/organizer/exhibitions/workspace/Content"));
const EventApplications = lazy(() => import("./pages/organizer/exhibitions/workspace/Applications"));
const EventFloorPlan = lazy(() => import("./pages/organizer/exhibitions/workspace/FloorPlan"));
const EventTickets = lazy(() => import("./pages/organizer/exhibitions/workspace/Tickets"));
const EventAttendees = lazy(() => import("./pages/organizer/exhibitions/workspace/Attendees"));
const OrganizerExhibitors = lazy(() => import("./pages/organizer/exhibitors/Exhibitors"));
const OrganizerStalls = lazy(() => import("./pages/organizer/stalls/Stalls"));
const OrganizerTickets = lazy(() => import("./pages/organizer/tickets/Tickets"));
const OrganizerTeam = lazy(() => import("./pages/organizer/team/Team"));
const OrganizerPublicProfileSettings = lazy(() => import("./pages/organizer/profile/PublicProfile"));
const OrganizerGallery = lazy(() => import("./pages/organizer/gallery/Gallery"));
const OrganizerScanner = lazy(() => import("./pages/organizer/checkin/Scanner"));
const OrganizerLeadAnalytics = lazy(() => import("./pages/organizer/leads/Analytics"));
const OrganizerLeads = lazy(() => import("./pages/organizer/leads/Leads"));
const OrganizerLeadDetail = lazy(() => import("./pages/organizer/leads/LeadDetail"));
const OrganizerVisitors = lazy(() => import("./pages/organizer/visitors/Visitors"));
const OrganizerPayments = lazy(() => import("./pages/organizer/payments/Payments"));
const OrganizerAnalytics = lazy(() => import("./pages/organizer/analytics/Analytics"));
const OrganizerComingSoon = lazy(() => import("./pages/organizer/ComingSoon"));
const OrganizerSettings = lazy(() => import("./pages/organizer/settings/Settings"));

const PlatformDashboard = lazy(() => import("./pages/platform/Dashboard"));
const PlatformOrganizers = lazy(() => import("./pages/platform/organizers/Organizers"));
const PlatformOrganizerDetail = lazy(() => import("./pages/platform/organizers/OrganizerDetail"));
const PlatformExhibitions = lazy(() => import("./pages/platform/Exhibitions"));
const PlatformExhibitionDetail = lazy(() => import("./pages/platform/exhibitions/ExhibitionDetail"));
const PlatformExhibitors = lazy(() => import("./pages/platform/Exhibitors"));
const PlatformExhibitorDetail = lazy(() => import("./pages/platform/exhibitors/ExhibitorDetail"));
const PlatformVisitors = lazy(() => import("./pages/platform/Visitors"));
const PlatformVisitorDetail = lazy(() => import("./pages/platform/visitors/VisitorDetail"));
const PlatformPayments = lazy(() => import("./pages/platform/Payments"));
const PlatformAuditLogs = lazy(() => import("./pages/platform/AuditLogs"));
const PlatformSubscriptions = lazy(() => import("./pages/platform/Subscriptions"));
const PlatformReports = lazy(() => import("./pages/platform/Reports"));
const PlatformSupport = lazy(() => import("./pages/platform/Support"));
const PlatformSettings = lazy(() => import("./pages/platform/Settings"));

const Auth = lazy(() => import("./pages/Auth"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const HowTicketBookingWorks = lazy(() => import("./pages/HowTicketBookingWorks"));
const HowExhibitionsWork = lazy(() => import("./pages/HowExhibitionsWork"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function RouteFallback() {
  return <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground" role="status" aria-live="polite">Loading page…</div>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CityProvider>
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/exhibitions" element={<ExhibitionListing />} />
                <Route path="/discover" element={<Navigate to="/exhibitions" replace />} />
                <Route path="/exhibition/:id" element={<ExhibitionDetail />} />
                <Route path="/organizers/:slug" element={<OrganizerPublicProfile />} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/book/:id" element={<BookingFlow />} />
                <Route path="/book-stall/:id" element={<StallBookingFlow />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/my-tickets" element={<ProtectedRoute><MyTickets /></ProtectedRoute>} />
                <Route path="/my-tickets/:ticketId" element={<ProtectedRoute><TicketDetail /></ProtectedRoute>} />
                <Route path="/exhibitors" element={<ForExhibitors />} />

                <Route element={<ExhibitorRoute><ExhibitorDashboardLayout /></ExhibitorRoute>}>
                  <Route path="/exhibitor-dashboard" element={<ExhibitorOverview />} />
                  <Route path="/exhibitor-dashboard/business" element={<MyBusiness />} />
                  <Route path="/exhibitor-dashboard/business/profile" element={<CompanyProfile />} />
                  <Route path="/exhibitor-dashboard/business/bank" element={<BankTax />} />
                  <Route path="/exhibitor-dashboard/business/team" element={<TeamRoles />} />
                  <Route path="/exhibitor-dashboard/participations" element={<MyParticipations />} />
                  <Route path="/exhibitor-dashboard/participations/:id/payments" element={<PaymentHistory />} />
                  <Route path="/exhibitor-dashboard/documents" element={<Documents />} />
                  <Route path="/exhibitor-dashboard/leads" element={<Leads />} />
                  <Route path="/exhibitor-dashboard/leads/:id" element={<LeadDetail />} />
                  <Route path="/exhibitor-dashboard/exhibitions" element={<ExhibitionsList />} />
                  <Route path="/exhibitor-dashboard/exhibitions/new" element={<CreateExhibition />} />
                  <Route path="/exhibitor-dashboard/sales" element={<Sales />} />
                  <Route path="/exhibitor-dashboard/tickets" element={<Tickets />} />
                  <Route path="/exhibitor-dashboard/stalls" element={<Stalls />} />
                  <Route path="/exhibitor-dashboard/attendees" element={<Attendees />} />
                  <Route path="/exhibitor-dashboard/scanner" element={<Scanner />} />
                  <Route path="/exhibitor-dashboard/analytics" element={<Analytics />} />
                  <Route path="/exhibitor-dashboard/settings" element={<ExhibitorSettings />} />
                </Route>

                <Route element={<OrganizerRoute><OrganizerDashboardLayout /></OrganizerRoute>}>
                  <Route path="/organizer" element={<OrganizerDashboard />} />
                  <Route path="/organizer/exhibitions" element={<OrganizerExhibitionsList />} />
                  <Route path="/organizer/exhibitions/new" element={<OrganizerCreateExhibition />} />
                  <Route path="/organizer/exhibitions/:id" element={<EventWorkspaceLayout />}>
                    <Route index element={<Navigate to="overview" replace />} />
                    <Route path="overview" element={<EventOverview />} />
                    <Route path="details" element={<EventDetails />} />
                    <Route path="content" element={<EventContent />} />
                    <Route path="applications" element={<EventApplications />} />
                    <Route path="floor-plan" element={<EventFloorPlan />} />
                    <Route path="tickets" element={<EventTickets />} />
                    <Route path="attendees" element={<EventAttendees />} />
                  </Route>
                  <Route path="/organizer/exhibitors" element={<OrganizerExhibitors />} />
                  <Route path="/organizer/stalls" element={<OrganizerStalls />} />
                  <Route path="/organizer/visitors" element={<OrganizerVisitors />} />
                  <Route path="/organizer/tickets" element={<OrganizerTickets />} />
                  <Route path="/organizer/checkin" element={<OrganizerScanner />} />
                  <Route path="/organizer/leads" element={<OrganizerLeads />} />
                  <Route path="/organizer/leads/analytics" element={<OrganizerLeadAnalytics />} />
                  <Route path="/organizer/leads/:id" element={<OrganizerLeadDetail />} />
                  <Route path="/organizer/marketing" element={<OrganizerComingSoon icon={Megaphone} title="Marketing" description="Campaigns and promotions. Coming soon." />} />
                  <Route path="/organizer/payments" element={<OrganizerPayments />} />
                  <Route path="/organizer/analytics" element={<OrganizerAnalytics />} />
                  <Route path="/organizer/team" element={<OrganizerTeam />} />
                  <Route path="/organizer/profile" element={<OrganizerPublicProfileSettings />} />
                  <Route path="/organizer/gallery" element={<OrganizerGallery />} />
                  <Route path="/organizer/settings" element={<OrganizerSettings />} />
                </Route>

                <Route element={<PlatformRoute><PlatformDashboardLayout /></PlatformRoute>}>
                  <Route path="/platform" element={<PlatformDashboard />} />
                  <Route path="/platform/organizers" element={<PlatformOrganizers />} />
                  <Route path="/platform/organizers/:id" element={<PlatformOrganizerDetail />} />
                  <Route path="/platform/exhibitions" element={<PlatformExhibitions />} />
                  <Route path="/platform/exhibitions/:id" element={<PlatformExhibitionDetail />} />
                  <Route path="/platform/exhibitors" element={<PlatformExhibitors />} />
                  <Route path="/platform/exhibitors/:id" element={<PlatformExhibitorDetail />} />
                  <Route path="/platform/visitors" element={<PlatformVisitors />} />
                  <Route path="/platform/visitors/:id" element={<PlatformVisitorDetail />} />
                  <Route path="/platform/payments" element={<PlatformPayments />} />
                  <Route path="/platform/audit-logs" element={<PlatformAuditLogs />} />
                  <Route path="/platform/subscriptions" element={<PlatformSubscriptions />} />
                  <Route path="/platform/reports" element={<PlatformReports />} />
                  <Route path="/platform/support" element={<PlatformSupport />} />
                  <Route path="/platform/settings" element={<PlatformSettings />} />
                </Route>

                <Route path="/auth" element={<Auth />} />
                <Route path="/about" element={<AboutUs />} />
                <Route path="/contact" element={<ContactUs />} />
                <Route path="/help" element={<HelpCenter />} />
                <Route path="/how-booking-works" element={<HowTicketBookingWorks />} />
                <Route path="/how-exhibitions-work" element={<HowExhibitionsWork />} />
                <Route path="/refund-policy" element={<RefundPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </CityProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
