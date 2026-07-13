import { trpc } from "@/lib/trpc";
import { wagmiConfig } from "@/lib/wagmi";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { MotionConfig } from "framer-motion";
import superjson from "superjson";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { TRPCClientError } from "@trpc/client";
import { getLoginUrl } from "@/const";
import { getApiBaseUrl } from "@/config";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

// Public routes must NEVER trigger a login redirect. Background polls on the
// Home/Demo pages (signals.stats, demo.*, auth.me) can surface UNAUTHORIZED for
// unauthenticated visitors — redirecting on those caused the page to "randomly
// reload". Only protected routes should bounce to /login, and only once.
const PUBLIC_ROUTE_PREFIXES = [
  "/", "/demo", "/login", "/register",
  "/forgot-password", "/reset-password", "/verify-email",
  "/security", "/terms", "/privacy", "/404",
];

function isPublicRoute(path: string): boolean {
  if (path === "/") return true;
  return PUBLIC_ROUTE_PREFIXES.some(
    (p) => p !== "/" && (path === p || path.startsWith(`${p}/`))
  );
}

let redirectingToLogin = false;
function redirectToLoginIfProtected() {
  if (redirectingToLogin) return;
  const path = window.location.pathname;
  if (isPublicRoute(path)) return;         // public page → ignore, no reload
  if (path === getLoginUrl()) return;      // already on login
  redirectingToLogin = true;
  window.location.href = getLoginUrl();
}

// Redirect on UNAUTHORIZED errors — protected routes only
queryClient.getQueryCache().subscribe((event) => {
  if (event?.type === "updated" && event?.action?.type === "error") {
    const error = (event.query.state.error as any);
    if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
      redirectToLoginIfProtected();
    }
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event?.type === "updated" && event?.mutation?.state?.error) {
    const error = event.mutation.state.error;
    if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
      redirectToLoginIfProtected();
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getApiBaseUrl()}/api/trpc`,
      transformer: superjson as any,
      headers() {
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find((s) => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) return { Authorization: `Bearer ${token}` };
          }
        } catch {}
        return {};
      },
      fetch(input, init) {
        return fetch(input, { ...init, credentials: "include" });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <WagmiProvider config={wagmiConfig}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {/* Honor the OS "reduce motion" setting for every framer-motion
            animation app-wide (transforms/layout become instant). */}
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </QueryClientProvider>
    </trpc.Provider>
  </WagmiProvider>,
);
