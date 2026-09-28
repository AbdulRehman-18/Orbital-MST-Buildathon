import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Route, Switch } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { ALL_NAV } from "@/components/layout/nav";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import HomePage from "@/pages/home";
import PlaceholderPage from "@/pages/placeholder";

const queryClient = new QueryClient();

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppShell>
            <Switch>
              <Route path="/" component={HomePage} />
              {ALL_NAV.filter((item) => item.path !== "/").map((item) => (
                <Route key={item.path} path={item.path}>
                  <PlaceholderPage item={item} />
                </Route>
              ))}
              <Route>
                <HomePage />
              </Route>
            </Switch>
          </AppShell>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
