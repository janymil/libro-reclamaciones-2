import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Complaints from "@/pages/complaints";
import Reports from "@/pages/reports";
import Businesses from "@/pages/businesses";
import Establishments from "@/pages/establishments";
import Books from "@/pages/books";
import UsersPage from "@/pages/users";
import Profile from "@/pages/profile";
import History from "@/pages/history";
import PublicPortal from "@/pages/public-portal";
import Compliance from "@/pages/compliance";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/complaints" component={Complaints} />
      <Route path="/reports" component={Reports} />
      <Route path="/businesses" component={Businesses} />
      <Route path="/establishments" component={Establishments} />
      <Route path="/books" component={Books} />
      <Route path="/users" component={UsersPage} />
      <Route path="/profile" component={Profile} />
      <Route path="/history" component={History} />
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
