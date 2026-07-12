import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, TrendingDown, Activity, Shield,
} from "lucide-react";

interface StatsCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub: string;
  azure: boolean;
  gold: boolean;
}

interface DashboardStatsRowProps {
  isDemoMode: boolean;
  demoCurrentBalance: number;
  demoTotalPnl: number;
  demoPnlPercent: string;
  anyConnected: boolean;
  killActive: boolean;
  web3Connected: boolean;
  currentBalance: number;
  totalPnl: number;
  pnlPct: string;
}

export default function DashboardStatsRow({
  isDemoMode, demoCurrentBalance, demoTotalPnl, demoPnlPercent,
  anyConnected, killActive, web3Connected,
  currentBalance, totalPnl, pnlPct,
}: DashboardStatsRowProps) {
  const stats: StatsCard[] = [
    {
      label: isDemoMode ? "Demo Balance" : "Portfolio Balance",
      value: isDemoMode
        ? `$${demoCurrentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <DollarSign className="w-4 h-4" />,
      sub: isDemoMode ? "Simulated paper balance" : (anyConnected ? "Live account value" : "Connect wallet to track"),
      azure: true,
      gold: isDemoMode,
    },
    {
      label: "Total P&L",
      value: isDemoMode
        ? `${demoTotalPnl >= 0 ? "+" : ""}$${demoTotalPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : (anyConnected
          ? `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "—"),
      icon: (isDemoMode ? demoTotalPnl : totalPnl) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
      sub: isDemoMode ? `${demoPnlPercent}% all time` : (anyConnected ? `${pnlPct}% all time` : "No live data yet"),
      azure: false,
      gold: isDemoMode || (anyConnected && totalPnl > 0),
    },
    {
      label: "Open Positions",
      value: "0",
      icon: <Activity className="w-4 h-4" />,
      sub: "Active trades",
      azure: false,
      gold: false,
    },
    {
      label: "Trading Status",
      value: killActive ? "Paused" : anyConnected ? "Active" : "Offline",
      icon: <Shield className="w-4 h-4" />,
      sub: anyConnected
        ? killActive ? "Kill switch on" : web3Connected ? "Ledger/Web3 ready" : "Aster agent active"
        : "No wallet connected",
      azure: false,
      gold: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden"
          style={stat.gold ? {
            background: "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.90), oklch(0.09 0.018 255 / 0.95))",
            borderColor: "oklch(0.82 0.16 85 / 0.30)",
            boxShadow: "0 0 0 1px oklch(0.82 0.16 85 / 0.10) inset, 0 0 30px oklch(0.82 0.16 85 / 0.10)",
            backdropFilter: "blur(16px)",
          } : stat.azure ? {
            background: "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.90), oklch(0.09 0.018 255 / 0.95))",
            borderColor: "oklch(0.60 0.22 220 / 0.25)",
            boxShadow: "0 0 0 1px oklch(0.60 0.22 220 / 0.08) inset, 0 0 30px oklch(0.60 0.22 220 / 0.06)",
            backdropFilter: "blur(16px)",
          } : {
            background: "linear-gradient(145deg, oklch(0.11 0.020 250 / 0.85), oklch(0.08 0.016 255 / 0.90))",
            borderColor: "oklch(0.60 0.22 220 / 0.12)",
            backdropFilter: "blur(12px)",
          }}
        >
          {stat.azure && <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(to right, transparent, oklch(0.60 0.22 220 / 0.40), transparent)" }} />}
          {stat.gold && <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(to right, transparent, oklch(0.82 0.16 85 / 0.50), transparent)" }} />}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
            <div style={stat.gold ? { color: "oklch(0.82 0.16 85)" } : stat.azure ? { color: "oklch(0.68 0.22 220)" } : { color: "oklch(0.50 0.015 260)" }}>{stat.icon}</div>
          </div>
          <div className={`text-xl font-heading font-bold mb-0.5 ${stat.gold ? "gold-shimmer-text" : "text-foreground"}`}>{stat.value}</div>
          <div className="text-xs text-muted-foreground">{stat.sub}</div>
        </motion.div>
      ))}
    </div>
  );
}
