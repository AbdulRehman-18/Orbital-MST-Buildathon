import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { WagmiProvider } from "wagmi";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { wagmiConfig } from "@/lib/wagmi";
import HomePage from "@/pages/home";

// Everything but the landing page is split out; dashboards and wallet flows load on demand.
const LoginPage = lazy(() => import("@/pages/login"));
const ProjectsPage = lazy(() => import("@/pages/projects"));
const ProjectDetailPage = lazy(() => import("@/pages/project-detail"));
const VerifyPage = lazy(() => import("@/pages/verify"));
const LedgerPage = lazy(() => import("@/pages/ledger"));
const TendersPage = lazy(() => import("@/pages/tenders"));
const WardPage = lazy(() => import("@/pages/ward"));
const CitizenDashboard = lazy(() => import("@/pages/roles/citizen"));
const OfficialDashboard = lazy(() => import("@/pages/roles/official"));
const AuditorDashboard = lazy(() => import("@/pages/roles/auditor"));
const ContractorDashboard = lazy(() => import("@/pages/roles/contractor"));
const AdminDashboard = lazy(() => import("@/pages/roles/admin"));

export default function App() {
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <AppShell>
                <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-6xl" />}>
                  <Switch>
                    <Route path="/" component={HomePage} />
                    <Route path="/login" component={LoginPage} />
                    <Route path="/projects" component={ProjectsPage} />
                    <Route path="/projects/:id" component={ProjectDetailPage} />
                    <Route path="/verify" component={VerifyPage} />
                    <Route path="/ledger" component={LedgerPage} />
                    <Route path="/tenders" component={TendersPage} />
                    <Route path="/ward/:id" component={WardPage} />
                    {/* One dashboard per role — the sidebar only links the signed-in user's. */}
                    <Route path="/citizen" component={CitizenDashboard} />
                    <Route path="/official" component={OfficialDashboard} />
                    <Route path="/auditor" component={AuditorDashboard} />
                    <Route path="/contractor" component={ContractorDashboard} />
                    <Route path="/admin" component={AdminDashboard} />
                    <Route component={HomePage} />
                  </Switch>
                </Suspense>
              </AppShell>
              <Toaster richColors position="top-center" />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
