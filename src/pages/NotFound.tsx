import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="glass-card rounded-2xl p-8 max-w-lg mx-4 text-center">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-destructive/10 rounded-full animate-pulse" />
            <AlertCircle className="relative h-16 w-16 text-destructive" />
          </div>
        </div>

        <h1 className="text-4xl font-heading font-bold text-foreground mb-2">404</h1>

        <h2 className="text-xl font-heading font-semibold text-foreground mb-4">
          Page Not Found
        </h2>

        <p className="text-muted-foreground mb-8 leading-relaxed">
          Sorry, the page you are looking for doesn't exist.
          <br />
          It may have been moved or deleted.
        </p>

        <Button
          onClick={() => setLocation("/")}
          className="btn-azure rounded-xl px-6 py-2.5 shadow-md hover:shadow-lg"
        >
          <Home className="w-4 h-4 mr-2" />
          Go Home
        </Button>
      </div>
    </div>
  );
}
