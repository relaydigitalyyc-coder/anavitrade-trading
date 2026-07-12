import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * DemoSignup is now a redirect shim.
 * All demo account creation flows through the unified Register page
 * with ?demo=true pre-selecting the demo toggle.
 */
export default function DemoSignup() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/register?demo=true", { replace: true });
  }, [navigate]);
  return null;
}
