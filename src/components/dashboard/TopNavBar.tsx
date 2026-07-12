import { Link } from "wouter";
import { Settings, LogOut, Sparkles, Wallet, CheckCircle2 } from "lucide-react";

interface TopNavBarProps {
  currentMode: "live" | "demo";
  isDemoMode: boolean;
  statusColor: string;
  dotColor: string;
  statusLabel: string;
  onSetLive: () => void;
  onSetDemo: () => void;
  onLogout: () => void;
}

export default function TopNavBar({
  currentMode, isDemoMode, statusColor, dotColor, statusLabel,
  onSetLive, onSetDemo, onLogout,
}: TopNavBarProps) {
  return (
    <div className="border-b px-6 py-4 sticky top-0 z-40"
      style={{ borderColor: "oklch(0.60 0.22 220 / 0.12)", background: "oklch(0.07 0.015 255 / 0.85)", backdropFilter: "blur(24px)" }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm"
              style={{ background: "linear-gradient(135deg, oklch(0.60 0.22 220), oklch(0.45 0.18 240))", color: "white" }}>
              A
            </div>
            <span className="font-heading font-bold text-foreground hidden sm:block">Anavitrade</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {/* Mode Toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border"
            style={{ borderColor: "oklch(0.60 0.22 220 / 0.15)", background: "oklch(0.08 0.012 260 / 0.5)" }}
          >
            <button
              onClick={onSetLive}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${currentMode === "live" ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Live
            </button>
            <button
              onClick={onSetDemo}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${isDemoMode ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Demo
            </button>
          </div>
          <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${statusColor}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {statusLabel}
          </div>
          <Link href="/settings">
            <button className="p-2 rounded-xl hover:bg-card transition-colors text-muted-foreground hover:text-foreground">
              <Settings className="w-4 h-4" />
            </button>
          </Link>
          <button
            onClick={onLogout}
            className="p-2 rounded-xl hover:bg-card transition-colors text-muted-foreground hover:text-red-400"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
