import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import DemoSignup from "./pages/DemoSignup";
import DemoDashboard from "./pages/DemoDashboard";
import PublicDemo from "./pages/PublicDemo";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import HyperliquidOnboarding from "./pages/HyperliquidOnboarding";
import LedgerOnboarding from "./pages/LedgerOnboarding";
import AccountSettings from "./pages/AccountSettings";
import Dashboard from "./pages/Dashboard";
import HistoricalPerformance from "./pages/HistoricalPerformance";
import Security from "./pages/Security";
import LegalPage from "./pages/LegalPage";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/_core/hooks/useAuth";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

function AnimatedRoutes() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      >
        <Switch location={location}>
          {/* Public */}
          <Route path="/" component={Home} />
          <Route path="/register" component={Register} />
          <Route path="/login" component={Login} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/verify-email" component={VerifyEmail} />

          {/* Demo (no auth required) */}
          <Route path="/demo" component={PublicDemo} />
          <Route path="/demo/signup" component={DemoSignup} />
          <Route path="/demo/dashboard/:token" component={DemoDashboard} />

          {/* Protected */}
          <Route path="/dashboard">
            {() => <ProtectedRoute component={Dashboard} />}
          </Route>
          <Route path="/performance">
            {() => <ProtectedRoute component={HistoricalPerformance} />}
          </Route>
          <Route path="/onboarding/hyperliquid">
            {() => <ProtectedRoute component={HyperliquidOnboarding} />}
          </Route>
          <Route path="/onboarding/ledger">
            {() => <ProtectedRoute component={LedgerOnboarding} />}
          </Route>
          <Route path="/settings">
            {() => <ProtectedRoute component={AccountSettings} />}
          </Route>

          {/* Public info pages */}
          <Route path="/security" component={Security} />
          <Route path="/terms">{() => <LegalPage type="terms" />}</Route>
          <Route path="/privacy">{() => <LegalPage type="privacy" />}</Route>

          {/* Fallback */}
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <AnimatedRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
