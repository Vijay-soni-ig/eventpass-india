import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CityProvider } from "@/hooks/useCityContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import ExhibitionListing from "./pages/ExhibitionListing";
import ExhibitionDetail from "./pages/ExhibitionDetail";
import OrganizerPublicProfile from "./pages/OrganizerPublicProfile";
import Notifications from "./pages/Notifications";
import BookingFlow from "./pages/BookingFlow";
import StallBookingFlow from "./pages/StallBookingFlow";
import Dashboard from "./pages/Dashboard";
import MyTickets from "./pages/MyTickets";
import TicketDetail from "./pages/TicketDetail";
import ForExhibitors from "./pages/ForExhibitors";
import ExhibitorRoute from "@/components/ExhibitorRoute";
import { DashboardLayout as ExhibitorDashboardLayout } from "@/components/exhibitor/layout/DashboardLayout";
import ExhibitorOverview from "./pages/exhibitor/Dashboard";
import MyBusiness from "./pages/exhibitor/business/MyBusiness";
import CompanyProfile from "./pages/exhibitor/business/CompanyProfile";
import BankTax from "./pages/exhibitor/business/BankTax";
import TeamRoles from "./pages/exhibitor/business/TeamRoles";
import MyParticipations from "./pages/exhibitor/participations/MyParticipations";
import PaymentHistory from "./pages/exhibitor/participations/PaymentHistory";
import Documents from "./pages/exhibitor/documents/Documents";
import Leads from "./pages/exhibitor/leads/Leads";
import LeadDetail from "./pages/exhibitor/leads/LeadDetail";
import ExhibitionsList from "./pages/exhibitor/exhibitions/ExhibitionsList";
import CreateExhibition from "./pages/exhibitor/exhibitions/CreateExhibition";
import Sales from "./pages/exhibitor/sales/Sales";
import Tickets from "./pages/exhibitor/tickets/Tickets";
import Stalls from "./pages/exhibitor/stalls/Stalls";
import Attendees from "./pages/exhibitor/attendees/Attendees";
import Scanner from "./pages/exhibitor/scanner/Scanner";
import Analytics from "./pages/exhibitor/analytics/Analytics";
import ExhibitorSettings from "./pages/exhibitor/settings/Settings";
import OrganizerRoute from "@/components/OrganizerRoute";
import { DashboardLayout as OrganizerDashboardLayout } from "@/components/organizer/layout/DashboardLayout";
import OrganizerDashboard from "./pages/organizer/Dashboard";
import OrganizerExhibitionsList from "./pages/organizer/exhibitions/ExhibitionsList";
import OrganizerCreateExhibition from "./pages/organizer/exhibitions/CreateExhibition";
import EventWorkspaceLayout from "@/components/organizer/exhibitions/EventWorkspaceLayout";
import EventOverview from "./pages/organizer/exhibitions/workspace/Overview";
import EventDetails from "./pages/organizer/exhibitions/workspace/Details";
import EventContent from "./pages/organizer/exhibitions/workspace/Content";
import EventApplications from "./pages/organizer/exhibitions/workspace/Applications";
import EventFloorPlan from "./pages/organizer/exhibitions/workspace/FloorPlan";
import EventTickets from "./pages/organizer/exhibitions/workspace/Tickets";
import EventAttendees from "./pages/organizer/exhibitions/workspace/Attendees";
import OrganizerExhibitors from "./pages/organizer/exhibitors/Exhibitors";
import OrganizerStalls from "./pages/organizer/stalls/Stalls";
import OrganizerTickets from "./pages/organizer/tickets/Tickets";
import OrganizerTeam from "./pages/organizer/team/Team";
import OrganizerPublicProfileSettings from "./pages/organizer/profile/PublicProfile";
import OrganizerGallery from "./pages/organizer/gallery/Gallery";
import OrganizerScanner from "./pages/organizer/checkin/Scanner";
import OrganizerLeadAnalytics from "./pages/organizer/leads/Analytics";
import OrganizerLeads from "./pages/organizer/leads/Leads";
import OrganizerLeadDetail from "./pages/organizer/leads/LeadDetail";
import OrganizerVisitors from "./pages/organizer/visitors/Visitors";
import OrganizerPayments from "./pages/organizer/payments/Payments";
import OrganizerAnalytics from "./pages/organizer/analytics/Analytics";
import OrganizerComingSoon from "./pages/organizer/ComingSoon";
import PlatformRoute from "@/components/PlatformRoute";
import { DashboardLayout as PlatformDashboardLayout } from "@/components/platform/layout/DashboardLayout";
import PlatformDashboard from "./pages/platform/Dashboard";
import PlatformOrganizers from "./pages/platform/organizers/Organizers";
import PlatformOrganizerDetail from "./pages/platform/organizers/OrganizerDetail";
import PlatformExhibitions from "./pages/platform/Exhibitions";
import PlatformExhibitionDetail from "./pages/platform/exhibitions/ExhibitionDetail";
import PlatformExhibitors from "./pages/platform/Exhibitors";
import PlatformExhibitorDetail from "./pages/platform/exhibitors/ExhibitorDetail";
import PlatformVisitors from "./pages/platform/Visitors";
import PlatformVisitorDetail from "./pages/platform/visitors/VisitorDetail";
import PlatformPayments from "./pages/platform/Payments";
import PlatformAuditLogs from "./pages/platform/AuditLogs";
import PlatformSubscriptions from "./pages/platform/Subscriptions";
import PlatformReports from "./pages/platform/Reports";
import PlatformSupport from "./pages/platform/Support";
import PlatformSettings from "./pages/platform/Settings";
import { Megaphone } from "lucide-react";
import Auth from "./pages/Auth";
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";
import HelpCenter from "./pages/HelpCenter";
import HowTicketBookingWorks from "./pages/HowTicketBookingWorks";
import HowExhibitionsWork from "./pages/HowExhibitionsWork";
import RefundPolicy from "./pages/RefundPolicy";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CityProvider>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/exhibitions" element={<ExhibitionListing />} />
            {/* The public Discover page (Events/Organizers tabs) was removed —
                the homepage is the discovery experience and /exhibitions is
                the one visitor marketplace (see IA-simplification task). A
                redirect, not a 404, in case any external/deep link still
                points at /discover. */}
            <Route path="/discover" element={<Navigate to="/exhibitions" replace />} />
            <Route path="/exhibition/:id" element={<ExhibitionDetail />} />
            <Route path="/organizers/:slug" element={<OrganizerPublicProfile />} />
            <Route path="/notifications" element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            } />
            <Route path="/book/:id" element={<BookingFlow />} />
            <Route path="/book-stall/:id" element={<StallBookingFlow />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/my-tickets" element={
              <ProtectedRoute>
                <MyTickets />
              </ProtectedRoute>
            } />
            <Route path="/my-tickets/:ticketId" element={
              <ProtectedRoute>
                <TicketDetail />
              </ProtectedRoute>
            } />
            <Route path="/exhibitors" element={<ForExhibitors />} />
            <Route
              element={
                <ExhibitorRoute>
                  <ExhibitorDashboardLayout />
                </ExhibitorRoute>
              }
            >
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
            <Route
              element={
                <OrganizerRoute>
                  <OrganizerDashboardLayout />
                </OrganizerRoute>
              }
            >
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
              <Route
                path="/organizer/marketing"
                element={
                  <OrganizerComingSoon
                    icon={Megaphone}
                    title="Marketing"
                    description="Campaigns and promotions. Coming soon."
                  />
                }
              />
              <Route path="/organizer/payments" element={<OrganizerPayments />} />
              <Route path="/organizer/analytics" element={<OrganizerAnalytics />} />
              <Route path="/organizer/team" element={<OrganizerTeam />} />
              <Route path="/organizer/profile" element={<OrganizerPublicProfileSettings />} />
              <Route path="/organizer/gallery" element={<OrganizerGallery />} />
              <Route path="/organizer/settings" element={<ExhibitorSettings />} />
            </Route>
            <Route
              element={
                <PlatformRoute>
                  <PlatformDashboardLayout />
                </PlatformRoute>
              }
            >
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
        </BrowserRouter>
      </TooltipProvider>
      </CityProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;