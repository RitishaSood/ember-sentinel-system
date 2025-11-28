import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalAlertListener } from "@/components/GlobalAlertListener";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Alerts from "./pages/Alerts";
import LocationsStatus from "./pages/LocationsStatus";
import Analytics from "./pages/Analytics";
import Profile from "./pages/Profile";
import ManageLocations from "./pages/ManageLocations";
import RequestLocation from "./pages/RequestLocation";
import SolvedCases from "./pages/SolvedCases";
import Locations from "./pages/Locations";
import LocationDetails from "./pages/LocationDetails";
import AlertDetails from "./pages/AlertDetails";
import MapView from "./pages/MapView";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>
    <div className="min-h-screen flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50 flex items-center px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6 bg-background overflow-auto">
          {children}
        </main>
      </div>
    </div>
  </SidebarProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <GlobalAlertListener />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<AppLayout><Home /></AppLayout>} />
          <Route path="/alerts" element={<AppLayout><Alerts /></AppLayout>} />
          <Route path="/locations-status" element={<AppLayout><LocationsStatus /></AppLayout>} />
          <Route path="/analytics" element={<AppLayout><Analytics /></AppLayout>} />
          <Route path="/profile" element={<AppLayout><Profile /></AppLayout>} />
          <Route path="/manage-locations" element={<AppLayout><ManageLocations /></AppLayout>} />
          <Route path="/request-location" element={<AppLayout><RequestLocation /></AppLayout>} />
          <Route path="/solved-cases" element={<AppLayout><SolvedCases /></AppLayout>} />
          <Route path="/locations" element={<AppLayout><Locations /></AppLayout>} />
          <Route path="/location/:id" element={<AppLayout><LocationDetails /></AppLayout>} />
          <Route path="/alert/:id" element={<AppLayout><AlertDetails /></AppLayout>} />
          <Route path="/map" element={<AppLayout><MapView /></AppLayout>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
