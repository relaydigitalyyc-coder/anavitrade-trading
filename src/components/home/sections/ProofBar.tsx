import { TrendingUp, Activity, Sparkles, Shield, Lock, Database } from "lucide-react";
import { trpc } from "@/lib/trpc";
import StatRail, { type StatItem } from "../primitives/StatRail";

/* ─── PROOF BAR ───
   Friendly, count-up trust strip. Numbers animate up on view, labels are
   plain language, and any finance term carries a one-line explainer so a
   complete beginner is never left guessing. Solid surface (no glass) keeps
   the numbers crisp and legible. */
export default function ProofBar() {
  const { data: demoStats } = trpc.demo.getPublicDemoStats.useQuery();

  const items: StatItem[] = [
    {
      value: demoStats?.tierAJulyCount != null ? Number(demoStats.tierAJulyCount) : 41,
      label: "Top-rated picks in July",
      hint: "Our engine grades every signal. These are the highest-confidence ones — what we call Tier A.",
      icon: <Database className="w-4 h-4" />,
      tone: "gold",
    },
    {
      value: demoStats?.totalReturnPct != null ? Number(demoStats.totalReturnPct) : 133.7,
      prefix: "+",
      suffix: "%",
      decimals: 1,
      label: "Growth in July (top picks)",
      hint: "How much a demo account following only the top-rated picks grew last month. Past results don't guarantee future ones.",
      icon: <TrendingUp className="w-4 h-4" />,
      tone: "green",
    },
    {
      value: demoStats?.avgPnlPct != null ? Number(demoStats.avgPnlPct) : 15.5,
      prefix: "+",
      suffix: "%",
      decimals: 1,
      label: "Average win per pick",
      hint: "The typical gain on a top-rated pick.",
      icon: <Activity className="w-4 h-4" />,
    },
    {
      value: demoStats?.bestPnlPct != null ? Number(demoStats.bestPnlPct) : 38.93,
      prefix: "+",
      suffix: "%",
      decimals: 2,
      label: "Best single pick",
      hint: "The strongest result from a single signal in July.",
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      display: "<0.01",
      suffix: "%",
      label: "Worst dip along the way",
      hint: "The largest drop the demo account saw before recovering — lower is calmer.",
      icon: <Shield className="w-4 h-4" />,
    },
    {
      display: "Zero",
      label: "Access to your money",
      hint: "We can place trades but can never withdraw. Your funds stay on your own exchange.",
      icon: <Lock className="w-4 h-4" />,
    },
  ];

  return (
    <section className="py-14 relative">
      <div className="container">
        {/* Remount when live data arrives so the count-up re-runs to the real
            values instead of freezing on the placeholder fallbacks. */}
        <StatRail key={demoStats ? "live" : "fallback"} items={items} />
      </div>
    </section>
  );
}
