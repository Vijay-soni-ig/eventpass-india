import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ExhibitionListing from "./pages/ExhibitionListing";
import ExhibitionDetail from "./pages/ExhibitionDetail";
import BookingFlow from "./pages/BookingFlow";
import Dashboard from "./pages/Dashboard";
import ForExhibitors from "./pages/ForExhibitors";
import ExhibitorDashboard from "./pages/ExhibitorDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/exhibitions" element={<ExhibitionListing />} />
          <Route path="/exhibition/:id" element={<ExhibitionDetail />} />
          <Route path="/book/:id" element={<BookingFlow />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/exhibitors" element={<ForExhibitors />} />
          <Route path="/exhibitor-dashboard" element={<ExhibitorDashboard />} />
          <Route path="/exhibitor-dashboard/create" element={<ExhibitorDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
