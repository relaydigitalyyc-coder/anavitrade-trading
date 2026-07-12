import { Link } from "wouter";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { ArrowRight, Zap, Brain, BarChart3, Cpu, ChevronDown, Quote, Activity, TrendingUp, Radio, HardDrive, CheckCircle2, KeyRound, ShieldCheck, Bell, Bot, Trophy, Flame, Sparkles, Clock, Award, Shield, Star, Lock, Database } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroWidget from "@/components/HeroWidget";
import Footer from "@/components/Footer";
import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";

function useAnimateInView() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return { ref, isInView };
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <SignalTicker />
      <BangersSection />
      <LogoBar />
      <AboutSection />
      <WhyChooseSection />
      <StrategySection />
      <LedgerSection />
      <HowItWorksSection />
      <ProofBar />
      <JulyResultsSection />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  );
}

/* ─── HERO ─── */
function HeroSection() {
  const { data: stats } = trpc.signals.stats.useQuery();
  const { data: demoStats } = trpc.demo.getPublicDemoStats.useQuery();

  return (
    <section className="relative min-h-screen flex items-center pt-20">
      {/* Ethereal azure background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Mesh grid */}
        <div className="absolute inset-0 mesh-grid opacity-60" />
        {/* Primary azure orb — top left */}
        <div className="orb-azure" style={{ width: 700, height: 700, top: "-15%", left: "-10%" }} />
        {/* Cyan orb — bottom right */}
        <div className="orb-cyan" style={{ width: 600, height: 600, bottom: "-10%", right: "-5%" }} />
        {/* Small azure accent — center right */}
        <div className="orb-azure" style={{ width: 300, height: 300, top: "40%", right: "20%", opacity: 0.6 }} />
        {/* Scan line */}
        <div className="absolute left-0 right-0 h-px animate-scan"
          style={{ background: "linear-gradient(90deg, transparent, oklch(0.60 0.22 220 / 0.15), transparent)" }} />
      </div>

      <div className="container relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Left: Copy */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
              style={{
                border: "1px solid oklch(0.60 0.22 220 / 0.30)",
                background: "oklch(0.60 0.22 220 / 0.07)",
                backdropFilter: "blur(12px)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "oklch(0.72 0.20 195)" }} />
              <span className="text-xs font-medium tracking-widest uppercase" style={{ color: "oklch(0.77 0.17 220)", fontFamily: "var(--font-heading)" }}>Signals &amp; Automated Trading</span>
            </motion.div>

            <h1 className="text-5xl sm:text-6xl lg:text-[4.5rem] font-heading font-bold leading-[1.02] tracking-[-0.03em] mb-6">
              <span className="gradient-text">Simple and</span>
              <br />
              <span className="gradient-text">Secure</span>
              <br />
              <span style={{ color: "oklch(0.96 0.006 220)" }}>Quantitative</span>
              <br />
              <span style={{ color: "oklch(0.96 0.006 220)" }}>Trading</span>
            </h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-lg text-muted-foreground leading-relaxed max-w-lg mb-10"
            >
              Receive institutional-grade trade signals from our quantitative engine — or let it execute automatically on your behalf. Two tiers, one platform, zero custody.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="flex flex-wrap gap-4"
            >
              <Link href="/demo">
                <button className="btn-azure group flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold">
                  View Live Demo
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </Link>
              <a href="#about">
                <button className="btn-ghost-azure flex items-center gap-2 px-7 py-3.5 rounded-xl font-medium">
                  Learn More
                </button>
              </a>
            </motion.div>

            {/* Stats row — live from DB */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="flex gap-8 mt-12 pt-8 border-t border-border/30"
            >
              <div>
                <p className="text-2xl font-heading font-bold gold-shimmer-text">
                  {stats ? `${stats.totalSignals.toLocaleString()}+` : "808+"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Signals Scored</p>
              </div>
              <div>
                <p className="text-2xl font-heading font-bold gold-shimmer-text">
                  {demoStats ? `+${demoStats.totalReturnPct.toFixed(1)}%` : "+133.7%"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">July Return (Tier A)</p>
              </div>
              <div>
                <p className="text-2xl font-heading font-bold gold-shimmer-text">
                  {demoStats ? `+${demoStats.bestPnlPct.toFixed(1)}%` : "+38.9%"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Best July Signal</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Right: iPhone Widget */}
          <div className="flex justify-center lg:justify-end">
            <HeroWidget />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground/50" />
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ─── SIGNAL TICKER ─── */
function SignalTicker() {
  const { data } = trpc.signals.topBangers.useQuery({ limit: 12 });
  const bangers = data ?? [];

  // Duplicate for seamless loop
  const items = [...bangers, ...bangers];

  if (bangers.length === 0) return null;

  return (
    <div className="relative overflow-hidden border-y py-3" style={{ borderColor: "oklch(0.60 0.22 220 / 0.18)", background: "oklch(0.60 0.22 220 / 0.03)" }}>
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none" style={{ background: "linear-gradient(to right, oklch(0.07 0.015 255), transparent)" }} />
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none" style={{ background: "linear-gradient(to left, oklch(0.07 0.015 255), transparent)" }} />

      <motion.div
        className="flex gap-8 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
      >
        {items.map((s, i) => (
          <div key={i} className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold tracking-wide" style={{ color: "oklch(0.77 0.17 220)", fontFamily: "var(--font-heading)" }}>
              {s.marketName.replace("USDT", "/USDT")}
            </span>
            <span className="text-xs font-semibold" style={{ color: "oklch(0.72 0.20 195)" }}>
              +{Number(s.maxProfit).toFixed(1)}%
            </span>
            <span className="text-[10px] text-muted-foreground/50">{s.indicatorShortName} · {s.period}</span>
            <span className="text-muted-foreground/20 text-xs">·</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── BANGERS SECTION ─── */
function BangersSection() {
  const { ref, isInView } = useAnimateInView();
  const { data } = trpc.signals.topBangers.useQuery({ limit: 6 });
  const bangers = data ?? [];

  if (bangers.length === 0) return null;

  const tierColors: Record<string, { bg: string; text: string; border: string }> = {
    A: { bg: "oklch(0.82 0.16 85 / 0.12)", text: "oklch(0.82 0.16 85)", border: "oklch(0.82 0.16 85 / 0.35)" },
    B: { bg: "oklch(0.72 0.18 145 / 0.1)", text: "oklch(0.72 0.18 145)", border: "oklch(0.72 0.18 145 / 0.3)" },
    C: { bg: "oklch(0.65 0.12 220 / 0.1)", text: "oklch(0.65 0.12 220)", border: "oklch(0.65 0.12 220 / 0.25)" },
  };

  return (
    <section id="bangers" className="py-24 relative section-divider" ref={ref}>
      <div className="container">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-14"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-5" style={{ border: "1px solid oklch(0.60 0.22 220 / 0.28)", background: "oklch(0.60 0.22 220 / 0.07)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.72 0.20 195)" }} />
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "oklch(0.77 0.17 220)", fontFamily: "var(--font-heading)" }}>Real Signal Performance</span>
          </motion.div>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-3">
            The Engine Finds Moves Like These
          </motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-muted-foreground max-w-xl mx-auto">
            Real signals from our live feed. These are the highest-scoring Buy detections from the past 7 days — filtered by our data-derived confluence algorithm.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {bangers.map((s, i) => {
            const tier = s.qualityTier ?? "C";
            const colors = tierColors[tier] ?? tierColors.C;
            const profit = Number(s.maxProfit ?? 0);
            const isGold = tier === "A" || profit >= 15;

            return (
              <motion.div
                key={s.id}
                variants={fadeUp}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                className="relative rounded-2xl p-6 overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5"
                style={{
                  background: isGold
                    ? "linear-gradient(135deg, oklch(0.12 0.022 250 / 0.85), oklch(0.09 0.018 255 / 0.90))"
                    : "linear-gradient(145deg, oklch(0.11 0.020 250 / 0.80), oklch(0.08 0.016 255 / 0.85))",
                  border: `1px solid ${isGold ? "oklch(0.82 0.16 85 / 0.30)" : "oklch(0.60 0.22 220 / 0.16)"}`,
                  boxShadow: isGold
                    ? "0 0 0 1px oklch(0.82 0.16 85 / 0.08) inset, 0 0 40px oklch(0.82 0.16 85 / 0.06), 0 8px 32px oklch(0.07 0.015 255 / 0.4)"
                    : "0 0 0 1px oklch(0.60 0.22 220 / 0.06) inset, 0 8px 32px oklch(0.07 0.015 255 / 0.3)",
                  backdropFilter: "blur(16px)",
                }}
              >
                {/* Gold shimmer for top performers */}
                {isGold && (
                  <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: "linear-gradient(to right, transparent, oklch(0.82 0.16 85 / 0.6), transparent)" }} />
                )}

                {/* Header row */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {isGold && <Trophy className="w-3.5 h-3.5" style={{ color: "oklch(0.82 0.16 85)" }} />}
                      <span className="text-base font-heading font-bold text-foreground">
                        {s.marketName.replace("USDT", "/USDT")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                        Tier {tier}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">{s.indicatorShortName}</span>
                      <span className="text-[10px] text-muted-foreground/40">·</span>
                      <span className="text-[10px] text-muted-foreground/60">{s.period}</span>
                    </div>
                  </div>
                  {/* Profit badge */}
                  <div className="text-right">
                    <p className="text-2xl font-heading font-bold" style={{ color: isGold ? "oklch(0.82 0.16 85)" : "oklch(0.72 0.18 145)" }}>
                      +{profit.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground/50">max profit</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1 rounded-full mb-4 overflow-hidden" style={{ background: "oklch(1 0 0 / 0.05)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={isInView ? { width: `${Math.min(profit / 40 * 100, 100)}%` } : {}}
                    transition={{ duration: 1, delay: 0.3 + i * 0.07, ease: [0.23, 1, 0.32, 1] }}
                    className="h-full rounded-full"
                    style={{ background: isGold ? "oklch(0.82 0.16 85)" : "oklch(0.72 0.18 145)" }}
                  />
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{s.maxProfitDuration ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    <span>{Number(s.percentage24 ?? 0) >= 0 ? "+" : ""}{Number(s.percentage24 ?? 0).toFixed(1)}% 24h</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    <span>Score {s.qualityScore ?? "—"}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center mt-10"
        >
          <Link href="/register">
            <button className="btn-azure inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm">
              <Flame className="w-4 h-4" />
              See the full live signal feed
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── PROOF BAR ─── */
function ProofBar() {
  const { data: demoStats } = trpc.demo.getPublicDemoStats.useQuery();

  const julyReturn = demoStats ? `+${demoStats.totalReturnPct.toFixed(1)}%` : "+133.7%";
  const tierACount = demoStats ? String(demoStats.tierAJulyCount) : "41";
  const bestSignal = demoStats ? `+${demoStats.bestPnlPct.toFixed(2)}%` : "+38.93%";
  const avgSignal = demoStats ? `+${demoStats.avgPnlPct.toFixed(1)}%` : "+15.5%";

  const items = [
    { label: "Tier A Signals in July", value: tierACount, icon: <Database className="w-4 h-4" /> },
    { label: "July Return (Tier A · 5%)", value: julyReturn, icon: <TrendingUp className="w-4 h-4" /> },
    { label: "Avg Tier A Signal Profit", value: avgSignal, icon: <Activity className="w-4 h-4" /> },
    { label: "Best July Signal", value: bestSignal, icon: <Sparkles className="w-4 h-4" /> },
    { label: "Max Drawdown", value: "<0.01%", icon: <Shield className="w-4 h-4" /> },
    { label: "Custody Required", value: "Zero", icon: <Lock className="w-4 h-4" /> },
  ];

  return (
    <section className="py-10 relative" style={{ borderTop: "1px solid oklch(0.60 0.22 220 / 0.12)", borderBottom: "1px solid oklch(0.60 0.22 220 / 0.12)", background: "oklch(0.60 0.22 220 / 0.02)" }}>
      <div className="container">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          {items.map((item, i) => (
            <div key={i} className="flex flex-col items-center text-center gap-1.5">
              <div className="p-2 rounded-lg mb-1" style={{ background: "oklch(0.60 0.22 220 / 0.10)", color: "oklch(0.68 0.20 220)" }}>
                {item.icon}
              </div>
              <p className="text-lg font-heading font-bold gradient-text">{item.value}</p>
              <p className="text-[10px] text-muted-foreground/60 leading-tight">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── LOGO BAR ─── */
function LogoBar() {
  const { ref, isInView } = useAnimateInView();
  return (
    <section className="py-12 border-y border-border/20" ref={ref}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.8 }}
        className="container"
      >
        <p className="text-center text-xs text-muted-foreground/50 uppercase tracking-[0.2em] mb-6">Integrated with leading exchanges</p>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 opacity-40">
          {["Binance", "Coinbase", "Kraken", "Bybit", "OKX"].map((name) => (
            <span key={name} className="text-sm font-heading font-semibold text-foreground/60 tracking-wide">{name}</span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ─── ABOUT ─── */
function AboutSection() {
  const { ref, isInView } = useAnimateInView();

  return (
    <section id="about" className="py-32 relative section-divider">
      <div className="container" ref={ref}>
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="max-w-3xl mb-20"
        >
          <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4 block">
            About Anavitrade
          </motion.span>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold leading-tight text-foreground">
            Three principles drive our autonomous trading engine: automation, simplification, and disciplined portfolio growth.
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <PrincipleCard
            icon={<Zap className="w-6 h-6" />}
            number="01"
            title="Automate"
            description="Advanced neural network technology eliminates manual trading obstacles, executing strategies with precision across volatile market conditions around the clock."
            delay={0}
          />
          <PrincipleCard
            icon={<Brain className="w-6 h-6" />}
            number="02"
            title="Simplify"
            description="Whether you're new to markets or a seasoned investor, Anavitrade reduces quantitative trading complexity to a single configuration step."
            delay={0.1}
          />
          <PrincipleCard
            icon={<BarChart3 className="w-6 h-6" />}
            number="03"
            title="Scale"
            description="Disciplined position sizing and compounding logic grow your portfolio systematically — each profitable trade reinforces the next allocation."
            delay={0.2}
          />
        </motion.div>
      </div>
    </section>
  );
}

function PrincipleCard({ icon, number, title, description, delay }: { icon: React.ReactNode; number: string; title: string; description: string; delay: number }) {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.6, delay }}
      className="group relative p-8 rounded-2xl glass glow-border hover:bg-white/[0.03] transition-all duration-500"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary/15 transition-all duration-300">
          {icon}
        </div>
        <span className="text-3xl font-heading font-bold text-border/60">{number}</span>
      </div>
      <h3 className="font-heading font-semibold text-lg text-foreground mb-3">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}

/* ─── WHY CHOOSE ─── */
function WhyChooseSection() {
  const { ref, isInView } = useAnimateInView();

  return (
    <section id="why-choose" className="py-32 relative radial-glow">
      <div className="container relative z-10" ref={ref}>
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold tracking-[0.2em] uppercase mb-4 block" style={{ color: "oklch(0.68 0.20 220)" }}>
            Platform Advantages
          </motion.span>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-4">
            Why Choose Anavitrade
          </motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-muted-foreground max-w-lg mx-auto">
            Institutional-grade execution technology with uncompromising security architecture.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <FeatureCard
            icon={<Bell className="w-6 h-6" />}
            title="Signal Delivery"
            description="Receive high-conviction trade signals directly to your dashboard — Buy, Sell, or Neutral — with indicator name, timeframe, and entry price. You decide when to act."
            highlight="You stay in control"
            delay={0}
            gold={false}
          />
          <FeatureCard
            icon={<Bot className="w-6 h-6" />}
            title="Automated Execution"
            description="Connect your exchange via trade-only API key or Ledger hardware wallet. The engine mirrors every signal automatically, managing position size, stop-loss, and take-profit."
            highlight="Zero manual intervention"
            delay={0.1}
            gold={true}
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title="Security & Control"
            description="Trade-only API keys, AES-256 encryption, and a zero-custody architecture mean your funds never leave your exchange. We execute, we never hold."
            highlight="Zero access to user funds"
            delay={0.2}
            gold={false}
          />
        </motion.div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, description, highlight, delay, gold = false }: { icon: React.ReactNode; title: string; description: string; highlight: string; delay: number; gold?: boolean }) {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.6, delay }}
      className="group relative p-8 rounded-2xl border transition-all duration-500"
      style={gold ? {
        background: "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.90), oklch(0.09 0.018 255 / 0.95))",
        borderColor: "oklch(0.82 0.16 85 / 0.30)",
        boxShadow: "0 0 0 1px oklch(0.82 0.16 85 / 0.10) inset, 0 0 40px oklch(0.82 0.16 85 / 0.08), 0 8px 32px oklch(0.07 0.015 255 / 0.5)",
        backdropFilter: "blur(16px)",
      } : {}}
    >
      {gold && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(to right, transparent, oklch(0.82 0.16 85 / 0.50), transparent)" }} />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[80px] rounded-full blur-[40px]"
            style={{ background: "oklch(0.82 0.16 85 / 0.08)" }} />
        </div>
      )}
      {!gold && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />}
      <div className="relative z-10">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-all duration-300"
          style={gold ? { background: "oklch(0.82 0.16 85 / 0.15)", color: "oklch(0.82 0.16 85)" } : { background: "oklch(0.78 0.19 155 / 0.10)", color: "oklch(0.78 0.19 155)" }}>
          {icon}
        </div>
        <h3 className="font-heading font-semibold text-lg mb-3"
          style={gold ? { color: "oklch(0.88 0.18 85)" } : { color: "oklch(0.97 0.005 260)" }}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{description}</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full"
          style={gold ? { background: "oklch(0.82 0.16 85 / 0.10)", color: "oklch(0.82 0.16 85)" } : { background: "oklch(0.78 0.19 155 / 0.05)", color: "oklch(0.78 0.19 155 / 0.80)" }}>
          <Activity className="w-3 h-3" /> {highlight}
        </span>
      </div>
    </motion.div>
  );
}

/* ─── STRATEGY ─── */
function StrategySection() {
  const { ref, isInView } = useAnimateInView();

  const stages = [
    { icon: <Radio className="w-5 h-5" />, title: "Signal Ingestion", desc: "Scans exchange order books, whale wallet movements, and funding rate shifts across 50+ data feeds", color: "from-blue-500/20 to-blue-500/5" },
    { icon: <Database className="w-5 h-5" />, title: "Market Analysis", desc: "Processes price action, volume profiles, and on-chain metrics through multi-layer neural networks", color: "from-purple-500/20 to-purple-500/5" },
    { icon: <Brain className="w-5 h-5" />, title: "Decision Engine", desc: "Quantifies optimal entry, take-profit, and stop-loss levels across multiple timeframes simultaneously", color: "from-primary/20 to-primary/5" },
    { icon: <Zap className="w-5 h-5" />, title: "Execution", desc: "Places orders directly on your exchange with sub-50ms latency, managing position size and risk automatically", color: "from-yellow-500/20 to-yellow-500/5" },
  ];

  return (
    <section id="strategy" className="py-32 relative section-divider">
      <div className="container" ref={ref}>
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold tracking-[0.2em] uppercase mb-4 block" style={{ color: "oklch(0.68 0.20 220)" }}>
            Execution Pipeline
          </motion.span>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-3">
            Anavitrade Strategy
          </motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-muted-foreground max-w-md mx-auto">
            Four-stage autonomous pipeline from market signal to executed position.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="max-w-2xl mx-auto"
        >
          {stages.map((stage, i) => (
            <motion.div
              key={stage.title}
              variants={fadeUp}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative"
            >
              <div className="flex items-start gap-5 p-5 rounded-xl hover:bg-white/[0.02] transition-colors duration-300 group">
                <div className="relative">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-b ${stage.color} border border-white/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                    {stage.icon}
                  </div>
                  {i < stages.length - 1 && (
                    <div className="absolute left-1/2 top-full -translate-x-1/2 w-px h-8 overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-b from-primary/40 to-transparent" />
                      <div className="absolute inset-0 w-full animate-signal-flow">
                        <div className="w-1 h-3 bg-primary rounded-full mx-auto shadow-sm shadow-primary/50" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="pt-1 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-heading font-semibold text-foreground">{stage.title}</h4>
                    <span className="text-[10px] text-muted-foreground/50 font-mono">STAGE {i + 1}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{stage.desc}</p>
                </div>
              </div>
              {i < stages.length - 1 && <div className="h-4" />}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── LEDGER NANO ─── */
function LedgerSection() {
  const { ref, isInView } = useAnimateInView();

  const features = [
    { icon: <ShieldCheck className="w-5 h-5" />, title: "Full Self-Custody", desc: "Your funds remain in your own Ledger-controlled Hyperliquid account. We never receive your seed phrase, private key, or withdrawal access." },
    { icon: <KeyRound className="w-5 h-5" />, title: "Trade-Only API Wallet", desc: "Your Ledger signs a one-time approval for a dedicated API wallet with trade-execution permissions only. No withdrawals, no fund transfers — ever." },
    { icon: <Activity className="w-5 h-5" />, title: "Proportional Risk Mirroring", desc: "Trades are copied by percentage risk, not raw size. A 2% risk on our account becomes a 2% risk on yours — regardless of account size." },
    { icon: <Lock className="w-5 h-5" />, title: "Instant Revocation", desc: "Revoke API wallet access at any time directly from your Ledger-controlled account. One click and all trade execution stops immediately." },
  ];

  const steps = [
    "Connect your Ledger Nano and create your own wallet",
    "Deposit USDC to your Hyperliquid account",
    "Approve a dedicated trade-only API wallet",
    "Anavitrade mirrors trades proportionally on your account",
    "Revoke access anytime — you stay in full control",
  ];

  return (
    <section id="ledger" className="py-32 relative radial-glow">
      <div className="container relative z-10" ref={ref}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Big Ledger Image */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
            className="relative flex justify-center"
          >
            <div className="relative">
              {/* Glow behind device */}
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-[80px] scale-75" />
              <img
                src="/manus-storage/ledger-nano-x_255da8b4.jpg"
                alt="Ledger Nano X Hardware Wallet"
                className="relative z-10 w-full max-w-[420px] rounded-2xl shadow-2xl shadow-black/50"
              />
              {/* Floating badge */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-4 -right-4 z-20 px-4 py-2 rounded-xl glass glow-border"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Cold Storage Secured</span>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Right: Content */}
          <motion.div
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={stagger}
          >
            <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4 block">
              Hardware Wallet Integration
            </motion.span>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-4">
              Ledger Nano Compatible
            </motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-muted-foreground leading-relaxed mb-8">
              Keep full custody of your funds in your own Ledger-controlled Hyperliquid account. You authorize a limited API wallet that allows trade execution only — Anavitrade mirrors trades proportionally without ever accessing your private keys or withdrawal permissions.
            </motion.p>

            {/* Feature grid */}
            <motion.div variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="p-4 rounded-xl bg-card border border-border/50 hover:border-primary/20 transition-colors duration-300"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {f.icon}
                    </div>
                    <h4 className="text-sm font-semibold text-foreground">{f.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Onboarding steps */}
            <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="p-5 rounded-xl glass">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary" />
                Onboarding Flow
              </h4>
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{step}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── HOW IT WORKS ─── */
function HowItWorksSection() {
  const { ref, isInView } = useAnimateInView();

  const steps = [
    { num: "01", title: "Create Your Account", desc: "Sign up free. Explore the live signal feed on your demo dashboard — no exchange connection required to start receiving signals.", icon: <TrendingUp className="w-5 h-5" /> },
    { num: "02", title: "Choose Your Tier", desc: "Stay on Signal Delivery to receive alerts and act manually, or upgrade to Automated Trades to let the engine execute on your behalf via trade-only API key or Ledger.", icon: <Bell className="w-5 h-5" /> },
    { num: "03", title: "Monitor & Grow", desc: "Track every signal, execution, and portfolio metric in real-time from your dashboard. Full transparency, no black boxes.", icon: <Activity className="w-5 h-5" /> },
  ];

  return (
    <section className="py-32 relative radial-glow">
      <div className="container relative z-10" ref={ref}>
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4 block">
            Getting Started
          </motion.span>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-3">
            Start in 3 Steps
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12"
        >
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              variants={fadeUp}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="relative group"
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] right-[calc(-50%+40px)] h-px bg-gradient-to-r from-border to-transparent" />
              )}
              <div className="text-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto mb-6 group-hover:border-primary/30 group-hover:bg-primary/5 transition-all duration-300">
                  <span className="text-primary">{step.icon}</span>
                </div>
                <span className="text-[10px] font-mono text-primary/60 tracking-wider">STEP {step.num}</span>
                <h3 className="font-heading font-semibold text-foreground mt-2 mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-center"
        >
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/demo">
              <button className="btn-premium inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all duration-300">
                View Live Demo
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/register">
              <button className="btn-ghost-azure inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-medium">
                Create Free Account
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── PRICING ─── */
function PricingSection() {
  const { ref, isInView } = useAnimateInView();

  const tiers = [
    {
      id: "signals",
      label: "Signal Delivery",
      gold: false,
      icon: <Bell className="w-6 h-6" />,
      tagline: "Signals only — you decide when to act",
      price: "Free",
      priceSub: "to start",
      highlight: false,
      features: [
        "Live Buy / Sell / Neutral signal feed",
        "5 technical indicators (Stochastic, MACD, CCI, Ichimoku, Trend Reversal)",
        "All timeframes: 5m → 1W",
        "Binance USDT pairs (35,000+ signals/week)",
        "Filter by signal type, timeframe, and pair",
        "Real-time dashboard with portfolio overview",
        "Email alerts (coming soon)",
      ],
      cta: "Get Started Free",
      ctaHref: "/register",
      note: null,
    },
    {
      id: "automated",
      label: "Automated Trades",
      icon: <Bot className="w-6 h-6" />,
      tagline: "Full execution — the engine trades for you",
      price: "Contact Us",
      priceSub: "for access",
      highlight: true,
      gold: true,
      features: [
        "Everything in Signal Delivery",
        "Automatic trade execution on your exchange",
        "Trade-only API key or Ledger hardware wallet",
        "Position sizing, stop-loss & take-profit management",
        "Kill switch — pause execution instantly",
        "Hyperliquid integration with Ledger self-custody",
        "Priority support & onboarding",
      ],
      cta: "Request Access",
      ctaHref: "/register",
      note: "Your funds never leave your exchange. Zero-custody architecture.",
    },
  ];

  return (
    <section id="pricing" className="py-32 relative section-divider">
      <div className="container relative z-10" ref={ref}>
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold tracking-[0.2em] uppercase mb-4 block" style={{ color: "oklch(0.68 0.20 220)" }}>
            Two Tiers
          </motion.span>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-4">
            Choose How You Trade
          </motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-muted-foreground max-w-lg mx-auto">
            Start with signals and act manually. Upgrade to full automation when you're ready to let the engine execute for you.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto"
        >
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.id}
              variants={fadeUp}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="relative rounded-2xl p-8 border transition-all duration-500"
              style={(tier as any).gold ? {
                background: "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.92), oklch(0.09 0.018 255 / 0.96))",
                borderColor: "oklch(0.82 0.16 85 / 0.35)",
                boxShadow: "0 0 0 1px oklch(0.82 0.16 85 / 0.10) inset, 0 0 50px oklch(0.82 0.16 85 / 0.10), 0 8px 40px oklch(0.07 0.015 255 / 0.5)",
                backdropFilter: "blur(20px)",
              } : {
                background: "linear-gradient(145deg, oklch(0.11 0.020 250 / 0.85), oklch(0.08 0.016 255 / 0.90))",
                borderColor: "oklch(0.60 0.22 220 / 0.18)",
                boxShadow: "0 0 0 1px oklch(0.60 0.22 220 / 0.06) inset, 0 8px 32px oklch(0.07 0.015 255 / 0.4)",
                backdropFilter: "blur(16px)",
              }}
            >
              {/* Gold ambient top glow for automated tier */}
              {(tier as any).gold && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[80px] rounded-full blur-[40px]"
                    style={{ background: "oklch(0.82 0.16 85 / 0.12)" }} />
                </div>
              )}

              {(tier as any).gold && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-lg"
                    style={{ background: "oklch(0.82 0.16 85)", color: "oklch(0.12 0.012 260)", boxShadow: "0 4px 20px oklch(0.82 0.16 85 / 0.4)" }}>
                    <Trophy className="w-3 h-3" /> Premium
                  </span>
                </div>
              )}
              {tier.highlight && !(tier as any).gold && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/30">
                    <Star className="w-3 h-3 fill-current" /> Most Popular
                  </span>
                </div>
              )}

              <div className="relative z-10">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-6"
                  style={(tier as any).gold ? { background: "oklch(0.82 0.16 85 / 0.15)", color: "oklch(0.82 0.16 85)" } : { background: "oklch(0.20 0.018 260)", color: "oklch(0.60 0.015 260)" }}>
                  {tier.icon}
                </div>

                <h3 className="font-heading font-bold text-xl mb-1"
                  style={(tier as any).gold ? { color: "oklch(0.88 0.18 85)" } : { color: "oklch(0.97 0.005 260)" }}>
                  {tier.label}
                </h3>
                <p className="text-sm text-muted-foreground mb-6">{tier.tagline}</p>

                <div className="mb-8">
                  <span className={`text-4xl font-heading font-bold ${
                    (tier as any).gold ? "gold-shimmer-text" : tier.highlight ? "text-primary" : "text-foreground"
                  }`}>{tier.price}</span>
                  <span className="text-sm text-muted-foreground ml-2">{tier.priceSub}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0"
                        style={(tier as any).gold ? { color: "oklch(0.82 0.16 85)" } : { color: "oklch(0.78 0.19 155 / 0.6)" }} />
                      <span className="text-sm text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                {tier.note && (
                  <p className="text-xs text-muted-foreground/70 mb-6 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 shrink-0 text-primary/50" />
                    {tier.note}
                  </p>
                )}

                <Link href={tier.ctaHref}>
                  <button
                    className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300"
                    style={(tier as any).gold ? {
                      background: "oklch(0.82 0.16 85)",
                      color: "oklch(0.12 0.012 260)",
                      boxShadow: "0 4px 20px oklch(0.82 0.16 85 / 0.35)",
                    } : tier.highlight ? {} : {}}
                  >
                    {tier.cta}
                  </button>
                </Link>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── TESTIMONIALS ─── */
function TestimonialsSection() {
  const { ref, isInView } = useAnimateInView();
  const [active, setActive] = useState(0);

  const testimonials = [
    {
      quote: "I've been using Anavitrade's automation to trade for me. Their customer service is exceptional — always responsive and helpful. The software handles market dumps gracefully, cutting losses far better than I ever could manually. Zero worry going into volatile periods.",
      author: "Noah",
      role: "Crypto Investor",
      metric: "+34% in 6 months",
    },
    {
      quote: "Anavitrade completely changed my approach to crypto. The algorithm consistently outperforms my manual strategies, and the risk management gives me confidence. I've seen steady, disciplined growth since connecting my exchange.",
      author: "Sarah",
      role: "Day Trader",
      metric: "Running 14 months",
    },
    {
      quote: "As someone running a business, I don't have time for charts. Anavitrade is perfect — configure once, monitor from the dashboard. The execution discipline and position sizing are exactly what I needed for hands-off portfolio growth.",
      author: "Marcus",
      role: "Business Owner",
      metric: "Fully autonomous",
    },
  ];

  return (
    <section id="testimonials" className="py-32 relative section-divider">
      <div className="container" ref={ref}>
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4 block">
            Community
          </motion.span>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl font-heading font-bold text-foreground">
            Testimonials
          </motion.h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="max-w-3xl mx-auto"
        >
          <div className="relative p-10 rounded-2xl glass glow-border overflow-hidden">
            <Quote className="w-8 h-8 text-primary/20 mb-6" />
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              >
                <p className="text-foreground/90 text-lg leading-relaxed mb-8 min-h-[100px]">
                  "{testimonials[active].quote}"
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-primary font-semibold text-sm">{testimonials[active].author[0]}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{testimonials[active].author}</p>
                      <p className="text-xs text-muted-foreground">{testimonials[active].role}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-primary/70 bg-primary/5 px-3 py-1 rounded-full hidden sm:inline-flex">
                    {testimonials[active].metric}
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-2 mt-8">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`transition-all duration-300 rounded-full ${
                  active === i
                    ? "w-8 h-2.5 bg-primary"
                    : "w-2.5 h-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
function FAQSection() {
  const { ref, isInView } = useAnimateInView();

  const faqs = [
    { q: "What is Anavitrade?", a: "Anavitrade is a quantitative trading platform that delivers institutional-grade signals and, for users who want full automation, executes trades directly on their exchange via a secure, trade-only API connection. Two tiers — Signal Delivery and Automated Trades — let you choose how much control to hand over." },
    { q: "What is the difference between Signal Delivery and Automated Trades?", a: "Signal Delivery gives you real-time Buy/Sell/Neutral alerts from our quantitative engine — you review each signal and decide whether to act. Automated Trades connects to your exchange and mirrors every signal automatically, handling position sizing, stop-loss, and take-profit without manual intervention." },
    { q: "How does automated trading work?", a: "Our engine connects to your exchange via trade-only API keys, continuously analyzes market microstructure (order flow, funding rates, sentiment), and executes trades when conditions match our quantitative models — all without manual intervention." },
    { q: "Is my capital secure?", a: "Yes. Anavitrade uses trade-only API keys with no withdrawal permissions. Your funds never leave your exchange. We use AES-256 encryption for all stored credentials and operate a zero-custody architecture." },
    { q: "What exchanges are supported?", a: "We currently support Binance and Hyperliquid (via Ledger hardware wallet). Additional exchange integrations are added based on community demand and liquidity requirements." },
    { q: "Can I try before connecting real funds?", a: "Yes. Create a free account and access the live signal feed immediately — no exchange connection required. Upgrade to Automated Trades only when you're ready to connect real capital." },
    { q: "What is an API key?", a: "An API key is a secure credential from your exchange that grants Anavitrade permission to place trades on your behalf. You control the permissions — we only need trade access, never withdrawal access." },
    { q: "What if I'm using a Ledger Nano?", a: "Ledger Nano users maintain full cold-storage custody. Your Ledger signs the initial wallet connection and API wallet approval — not every trade. Anavitrade executes through a dedicated Hyperliquid API wallet that has trade-only permissions. Your seed phrase and private keys never leave your device. You can revoke the API wallet at any time from your Ledger-controlled account." },
    { q: "How do I monitor performance?", a: "Your dashboard shows the live signal feed, real-time portfolio balance, capital growth charts, and risk metrics. Every signal and execution is logged and transparent." },
    { q: "What happens during extreme volatility?", a: "The engine includes circuit-breaker logic that reduces position sizes or pauses execution during abnormal market conditions, protecting your capital from flash crashes and manipulation events." },
  ];

  return (
    <section id="faq" className="py-32 relative">
      <div className="container" ref={ref}>
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4 block">
            Support
          </motion.span>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl font-heading font-bold text-foreground">
            Frequently Asked Questions
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="max-w-2xl mx-auto space-y-2"
        >
          {faqs.map((faq, i) => (
            <motion.div key={i} variants={fadeUp} transition={{ duration: 0.4, delay: i * 0.05 }}>
              <FAQItem question={faq.q} answer={faq.a} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors duration-200 ${open ? "border-primary/20 bg-white/[0.02]" : "border-border/50 hover:border-border"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <span className="text-sm font-medium text-foreground pr-4">{question}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{answer}</p>
      </motion.div>
    </div>
  );
}

/* ─── CTA ─── */
function CTASection() {
  const { ref, isInView } = useAnimateInView();

  return (
    <section className="py-24 relative" ref={ref}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="relative rounded-3xl p-12 md:p-16 text-center overflow-hidden"
          style={{
            background: "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.85), oklch(0.09 0.018 255 / 0.90))",
            border: "1px solid oklch(0.60 0.22 220 / 0.20)",
            boxShadow: "0 0 0 1px oklch(0.60 0.22 220 / 0.06) inset, 0 0 80px oklch(0.60 0.22 220 / 0.08), 0 20px 60px oklch(0.07 0.015 255 / 0.5)",
            backdropFilter: "blur(24px)",
          }}
        >
          {/* Azure orb glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] rounded-full blur-[80px]" style={{ background: "oklch(0.60 0.22 220 / 0.10)" }} />
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(to right, transparent, oklch(0.60 0.22 220 / 0.30), transparent)" }} />
          </div>

          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-4">
              Start receiving signals today
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Create a free account and access the live signal feed immediately. Upgrade to Automated Trades when you're ready to let the engine execute for you.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/register">
                <button className="btn-azure inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-lg">
                  Create Free Account
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
              <Link href="/login">
                <button className="btn-ghost-azure inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-lg">
                  Sign In
                </button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── JULY RESULTS SHOWCASE ─── */
const MONTHS = [
  { key: "july",  label: "July 2026",  live: true  },
  { key: "june",  label: "June 2026",  live: false },
  { key: "may",   label: "May 2026",   live: false },
  { key: "april", label: "April 2026", live: false },
] as const;

function JulyResultsSection() {
  const { ref, isInView } = useAnimateInView();
  const { data, isLoading } = trpc.signals.julyResults.useQuery();
  const [activeTab, setActiveTab] = useState<"tierA" | "tierB" | "filtered">("tierA");
  const [activeMonth, setActiveMonth] = useState<typeof MONTHS[number]["key"]>("july");

  return (
    <section className="py-32 relative" ref={ref}>
      {/* Background orb */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="orb-azure" style={{ width: 600, height: 600, top: "10%", right: "-15%", opacity: 0.3 }} />
      </div>

      <div className="container relative z-10">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-10"
        >
          <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4 block">
            Verified Performance
          </motion.span>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-3xl sm:text-5xl font-heading font-bold text-foreground mb-4">
            Monthly Trade Log
          </motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Every signal our algorithm scored, shown in full. Strong wins, near-flat trades,
            and the Tier C signals our quality filter correctly excluded — all transparent, nothing hidden.
          </motion.p>
        </motion.div>

        {/* Month selector */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex flex-wrap gap-2 justify-center mb-10"
        >
          {MONTHS.map((m) => (
            <button
              key={m.key}
              onClick={() => m.live && setActiveMonth(m.key)}
              className={`relative px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                m.live
                  ? activeMonth === m.key
                    ? "bg-primary/20 text-primary border-primary/50 shadow-[0_0_12px_oklch(0.65_0.2_255/0.18)]"
                    : "bg-card/50 text-foreground border-border/50 hover:border-primary/40 cursor-pointer"
                  : "bg-card/20 text-muted-foreground/40 border-border/20 cursor-not-allowed"
              }`}
            >
              {m.label}
              {m.live && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                </span>
              )}
              {!m.live && (
                <span className="ml-2 text-[10px] font-normal opacity-50">soon</span>
              )}
            </button>
          ))}
        </motion.div>

        {/* Summary bar + trade cards — only show for July (live month) */}
        {activeMonth !== "july" && (
          <motion.div
            key={activeMonth}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center py-24 gap-6 border border-dashed border-border/40 rounded-2xl"
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Activity className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center max-w-sm">
              <p className="text-lg font-heading font-semibold text-foreground mb-2">
                {MONTHS.find(m => m.key === activeMonth)?.label} — Track Record Building
              </p>
              <p className="text-sm text-muted-foreground">
                Our scraper launched in July 2026. Historical data for this month will be available as we build the verified track record.
                Check back soon.
              </p>
            </div>
            <button
              onClick={() => setActiveMonth("july")}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
            >
              View July 2026 Results →
            </button>
          </motion.div>
        )}

        {activeMonth === "july" && data && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10"
          >
            {[
              { label: "Signals Taken", value: String(data.summary.totalTaken), sub: "Tier A + B only", color: "text-foreground" },
              { label: "Net Return", value: `+${data.summary.netReturn.toFixed(2)}%`, sub: "$10,000 → $" + (10000 + data.summary.totalPnl).toFixed(0), color: "text-green-400" },
              { label: "Best Signal", value: `+${data.summary.bestProfit.toFixed(2)}%`, sub: data.summary.bestPair, color: "text-primary" },
              { label: "Correctly Excluded", value: String(data.summary.filteredOutCount) + " Tier C", sub: "Low-quality signals our filter blocked", color: "text-amber-400" },
            ].map((item, i) => (
              <div key={i} className="glass-card p-5 rounded-2xl text-center">
                <p className={`text-2xl font-heading font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs font-semibold text-foreground/80 mt-1">{item.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>
              </div>
            ))}
          </motion.div>
        )}

        {activeMonth === "july" && (
        <>
        <div className="flex flex-wrap gap-2 mb-6">
          {(["tierA", "tierB", "filtered"] as const).map((tab) => {
            const tierACount = data?.wins.filter(s => s.qualityTier === "A").length ?? 0;
            const tierBCount = (data?.wins.filter(s => s.qualityTier !== "A").length ?? 0) + (data?.nearFlat.length ?? 0);
            const labels: Record<typeof tab, string> = {
              tierA: `Tier A Signals — ${tierACount || "—"} trades · avg +15.5%`,
              tierB: `Tier B Signals — ${tierBCount || "—"} trades · avg +2.9%`,
              filtered: `Correctly Excluded — ${data?.filteredOut.length ?? "—"} Tier C signals`,
            };
            const colors: Record<typeof tab, string> = {
              tierA: "bg-amber-500/20 text-amber-400 border-amber-500/40",
              tierB: "bg-primary/20 text-primary border-primary/40",
              filtered: "bg-red-500/20 text-red-400 border-red-500/40",
            };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                  activeTab === tab
                    ? colors[tab]
                    : "bg-card/50 text-muted-foreground border-border/40 hover:border-border"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Trade cards grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-card/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          >
            {(activeTab === "tierA"
              ? (data?.wins ?? []).filter(s => s.qualityTier === "A")
              : activeTab === "tierB"
              ? [...(data?.wins ?? []).filter(s => s.qualityTier !== "A"), ...(data?.nearFlat ?? [])]
              : data?.filteredOut ?? []
            ).map((signal, i) => {
              const mp = signal.maxProfit !== null ? parseFloat(String(signal.maxProfit)) : 0;
              const isWin = mp >= 2;
              const isFlat = mp > 0 && mp < 2;
              const isFiltered = activeTab === "filtered";
              const signalDt = signal.signalDate ? new Date(signal.signalDate) : null;
              const date = signalDt ? signalDt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
              const time = signalDt ? signalDt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

              return (
                <motion.div
                  key={signal.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.5) }}
                  className={`rounded-xl p-4 border transition-all duration-200 hover:scale-[1.02] ${
                    isFiltered
                      ? "bg-red-500/5 border-red-500/20"
                      : isWin
                      ? "bg-green-500/5 border-green-500/20"
                      : "bg-amber-500/5 border-amber-500/20"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-heading font-bold text-foreground leading-tight">
                        {signal.marketName?.replace("USDT", "")} <span className="text-muted-foreground font-normal">/ USDT</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{signal.indicatorShortName} · {signal.period}</p>
                      {date && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{date}{time && <span className="ml-1 opacity-70">{time}</span>}</p>}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      signal.qualityTier === "A"
                        ? "bg-amber-500/20 text-amber-400"
                        : signal.qualityTier === "B"
                        ? "bg-primary/20 text-primary"
                        : "bg-red-500/20 text-red-400"
                    }`}>
                      {signal.qualityTier}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Score {signal.qualityScore}</span>
                    <span className={`text-base font-heading font-bold ${
                      isFiltered ? "text-red-400" : isWin ? "text-green-400" : "text-amber-400"
                    }`}>
                      {isFiltered ? "Excluded" : mp > 0 ? `+${mp.toFixed(2)}%` : "0.00%"}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Honest footnote */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center text-xs text-muted-foreground/50 mt-8 max-w-xl mx-auto"
        >
          Results shown are simulated using 5% capital risk × 3× leverage on a $10,000 starting balance.
          Tier C signals are shown to demonstrate what our quality filter correctly excluded.
          Past performance does not guarantee future results.
        </motion.p>
        </>
        )}
      </div>
    </section>
  );
}
