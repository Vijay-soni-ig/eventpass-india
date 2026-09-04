import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import ExhibitionListing from "./pages/ExhibitionListing";
import ExhibitionDetail from "./pages/ExhibitionDetail";
import BookingFlow from "./pages/BookingFlow";
import StallBookingFlow from "./pages/StallBookingFlow";
import Dashboard from "./pages/Dashboard";
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
import ExhibitionsList from "./pages/exhibitor/exhibitions/ExhibitionsList";
import CreateExhibition from "./pages/exhibitor/exhibitions/CreateExhibition";
import ExhibitorExhibitionDetail from "./pages/exhibitor/exhibitions/ExhibitionDetail";
import Sales from "./pages/exhibitor/sales/Sales";
import Tickets from "./pages/exhibitor/tickets/Tickets";
import CreateTicket from "./pages/exhibitor/tickets/CreateTicket";
import Stalls from "./pages/exhibitor/stalls/Stalls";
import StallEditor from "./pages/exhibitor/stalls/StallEditor";
import Attendees from "./pages/exhibitor/attendees/Attendees";
import Scanner from "./pages/exhibitor/scanner/Scanner";
import Analytics from "./pages/exhibitor/analytics/Analytics";
import ExhibitorSettings from "./pages/exhibitor/settings/Settings";
import OrganizerRoute from "@/components/OrganizerRoute";
import { DashboardLayout as OrganizerDashboardLayout } from "@/components/organizer/layout/DashboardLayout";
import OrganizerDashboard from "./pages/organizer/Dashboard";
import OrganizerExhibitionsList from "./pages/organizer/exhibitions/ExhibitionsList";
import OrganizerCreateExhibition from "./pages/organizer/exhibitions/CreateExhibition";
import OrganizerExhibitionEdit from "./pages/organizer/exhibitions/ExhibitionEdit";
import OrganizerStalls from "./pages/organizer/stalls/Stalls";
import OrganizerTickets from "./pages/organizer/tickets/Tickets";
import OrganizerTeam from "./pages/organizer/team/Team";
import OrganizerComingSoon from "./pages/organizer/ComingSoon";
import { Building2, Users, QrCode, Target, Megaphone, CreditCard, BarChart3 } from "lucide-react";
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
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/exhibitions" element={<ExhibitionListing />} />
            <Route path="/exhibition/:id" element={<ExhibitionDetail />} />
            <Route path="/book/:id" element={<BookingFlow />} />
            <Route path="/book-stall/:id" element={<StallBookingFlow />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
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
              <Route path="/exhibitor-dashboard/exhibitions" element={<ExhibitionsList />} />
              <Route path="/exhibitor-dashboard/exhibitions/new" element={<CreateExhibition />} />
              <Route path="/exhibitor-dashboard/exhibitions/:id" element={<ExhibitorExhibitionDetail />} />
              <Route path="/exhibitor-dashboard/sales" element={<Sales />} />
              <Route path="/exhibitor-dashboard/tickets" element={<Tickets />} />
              <Route path="/exhibitor-dashboard/tickets/new" element={<CreateTicket />} />
              <Route path="/exhibitor-dashboard/stalls" element={<Stalls />} />
              <Route path="/exhibitor-dashboard/stalls/editor/:exhibitionId" element={<StallEditor />} />
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
              <Route path="/organizer/exhibitions/:id" element={<OrganizerExhibitionEdit />} />
              <Route
                path="/organizer/exhibitors"
                element={
                  <OrganizerComingSoon
                    icon={Building2}
                    title="Exhibitors"
                    description="Invite and approve exhibitors for your exhibitions. Coming soon."
                  />
                }
              />
              <Route path="/organizer/stalls" element={<OrganizerStalls />} />
              <Route
                path="/organizer/visitors"
                element={
                  <OrganizerComingSoon
                    icon={Users}
                    title="Visitors"
                    description="Visitor profiles and history. Coming soon."
                  />
                }
              />
              <Route path="/organizer/tickets" element={<OrganizerTickets />} />
              <Route
                path="/organizer/checkin"
                element={
                  <OrganizerComingSoon
                    icon={QrCode}
                    title="Check-in"
                    description="Gate check-in scanning for organizer staff. Coming soon."
                  />
                }
              />
              <Route
                path="/organizer/leads"
                element={
                  <OrganizerComingSoon icon={Target} title="Leads" description="Lead capture and export. Coming soon." />
                }
              />
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
              <Route
                path="/organizer/payments"
                element={
                  <OrganizerComingSoon
                    icon={CreditCard}
                    title="Payments"
                    description="Payment reconciliation and payouts. Coming soon."
                  />
                }
              />
              <Route
                path="/organizer/analytics"
                element={
                  <OrganizerComingSoon
                    icon={BarChart3}
                    title="Analytics"
                    description="Deeper cross-exhibition analytics. Coming soon."
                  />
                }
              />
              <Route path="/organizer/team" element={<OrganizerTeam />} />
              <Route path="/organizer/settings" element={<ExhibitorSettings />} />
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
    </AuthProvider>
  </QueryClientProvider>
);

export default App;