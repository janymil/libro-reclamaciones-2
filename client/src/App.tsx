import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Complaints from "@/pages/complaints";
import PublicPortal from "@/pages/public-portal";
import Establishments from "@/pages/establishments";
import Compliance from "@/pages/compliance";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/complaints" component={Complaints} />
      <Route path="/establishments" component={Establishments} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/r/:businessId" component={PublicPortal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
