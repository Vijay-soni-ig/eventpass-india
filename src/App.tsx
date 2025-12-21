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
import ExhibitorDashboard from "./pages/ExhibitorDashboard";
import Auth from "./pages/Auth";
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
            <Route path="/exhibitor-dashboard" element={
              <ProtectedRoute>
                <ExhibitorDashboard />
              </ProtectedRoute>
            } />
            <Route path="/exhibitor-dashboard/create" element={
              <ProtectedRoute>
                <ExhibitorDashboard />
              </ProtectedRoute>
            } />
            <Route path="/auth" element={<Auth />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
