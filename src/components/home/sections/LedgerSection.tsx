import { useRef, useCallback } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { ShieldCheck, KeyRound, Activity, Lock, HardDrive } from "lucide-react";
import { useSectionInView } from "../hooks/useSectionInView";
import Reveal from "../primitives/Reveal";
import Explainer from "../primitives/Explainer";
import { fadeUp, stagger, cappedDelay, EASE_OUT } from "../hooks/motion";

/* ─── LEDGER NANO ───
   Kept the strong asymmetric layout; elevated the execution: dramatic scroll
   parallax on the device, 3D-tilt feature-card icons, timeline with staggered
   draw-in animation, and a pulsing glow behind the device. */

/* ── 3D perspective tilt on mouse-follow ─────────────────────────────
   Wraps the icon badge so it tilts toward the cursor, adding a tactile
   interactive feel without overwhelming the hairline-divided list. */
function TiltIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  const prefersReduced = useReducedMotion();
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const smoothX = useSpring(x, { stiffness: 300, damping: 30 });
  const smoothY = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(smoothY, [0, 1], [8, -8]);
  const rotateY = useTransform(smoothX, [0, 1], [-8, 8]);

  const handleMouse = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      x.set((e.clientX - rect.left) / rect.width);
      y.set((e.clientY - rect.top) / rect.height);
    },
    [x, y],
  );

  const handleLeave = useCallback(() => {
    x.set(0.5);
    y.set(0.5);
  }, [x, y]);

  if (prefersReduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      style={{ perspective: 800, rotateX, rotateY }}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
    >
      {children}
    </motion.div>
  );
}

export default function LedgerSection() {
  const { ref, isInView } = useSectionInView();
  const prefersReduced = useReducedMotion();

  /* ── 1. Stronger scroll parallax ───────────────────────────────── */
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: imageWrapRef,
    offset: ["start end", "end start"],
  });
  const parallaxY = useTransform(
    scrollYProgress,
    [0, 1],
    prefersReduced ? [0, 0] : [120, -120],
  );
  const parallaxScale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    prefersReduced ? [1, 1, 1] : [0.9, 1, 0.9],
  );

  const features = [
    { icon: <ShieldCheck className="w-5 h-5" />, title: "Your keys, your coins", desc: "Funds stay in your own Ledger-controlled account. We never see your seed phrase or recovery details." },
    { icon: <KeyRound className="w-5 h-5" />, title: "Trade-only access", desc: "You approve a limited connection that can place trades — but can never withdraw or move your money." },
    { icon: <Activity className="w-5 h-5" />, title: "Fair, proportional copying", desc: "Trades are matched by percentage, not size. A small risk on our side is the same small risk on yours." },
    { icon: <Lock className="w-5 h-5" />, title: "Switch off anytime", desc: "Revoke access from your own device in one tap, and every trade stops immediately." },
  ];

  const steps = [
    "Connect your Ledger and create your wallet",
    "Add funds to your own account",
    "Approve a trade-only connection",
    "Anavitrade mirrors trades on your account",
    "Switch it off whenever you like",
  ];

  return (
    <section id="ledger" className="py-32 relative radial-glow">
      <div className="container relative z-10" ref={ref}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: device with scroll parallax */}
          <div ref={imageWrapRef} className="relative flex justify-center">
            <motion.div
              style={{ y: parallaxY, scale: parallaxScale }}
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, ease: EASE_OUT }}
              className="relative"
            >
              {/* 5. Subtle glow pulse around the device — two layered halos */}
              <motion.div
                className="absolute inset-0 bg-primary/15 rounded-full blur-[100px] scale-90"
                animate={
                  prefersReduced
                    ? undefined
                    : {
                        scale: [0.85, 1.1, 0.85],
                        opacity: [0.3, 0.7, 0.3],
                      }
                }
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <motion.div
                className="absolute inset-0 bg-electric/10 rounded-full blur-[120px] scale-75"
                animate={
                  prefersReduced
                    ? undefined
                    : {
                        scale: [0.7, 1.0, 0.7],
                        opacity: [0.15, 0.45, 0.15],
                      }
                }
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5,
                }}
              />
              <img
                src="/manus-storage/ledger-nano-x_255da8b4.jpg"
                alt="Ledger Nano X Hardware Wallet"
                className="relative z-10 w-full max-w-[420px] rounded-2xl shadow-2xl shadow-black/50"
              />
              <motion.div
                animate={prefersReduced ? undefined : { y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-4 -right-4 z-20 px-4 py-2 rounded-xl glass glow-border"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Cold Storage Secured</span>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Right: content */}
          <motion.div initial="hidden" animate={isInView ? "visible" : "hidden"} variants={stagger}>
            <motion.span variants={fadeUp} transition={{ duration: 0.6 }} className="text-[0.7rem] font-medium tracking-[0.18em] uppercase text-electric mb-4 block">
              Hardware Wallet Support
            </motion.span>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="text-4xl sm:text-5xl font-heading font-medium tracking-[-0.035em] text-foreground mb-4">
              Works with your Ledger
            </motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-muted-foreground leading-relaxed mb-8 max-w-lg">
              Prefer to keep your crypto in cold storage? Anavitrade plugs into your own Ledger-controlled account and trades on your behalf — without ever touching your keys or your ability to withdraw.
            </motion.p>

            {/* Feature list — hairline-divided, with 3D tilt on the icon */}
            <motion.div variants={stagger} className="mb-8">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  transition={{ duration: 0.5, delay: cappedDelay(i, 0.08) }}
                  className={`flex items-start gap-4 py-4 ${i > 0 ? "hairline-divide" : ""}`}
                >
                  <TiltIcon className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center text-primary shrink-0">
                    {f.icon}
                  </TiltIcon>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-0.5">{f.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Onboarding timeline — staggered draw-in with framer-motion */}
            <Reveal className="p-5 rounded-xl glass">
              <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary" />
                How setup works
                <Explainer text="A one-time, five-minute setup. After this it runs on its own." label="setup" />
              </h4>
              <div className="relative">
                {/* Animated connecting line — draws in from top via scaleY */}
                <div className="absolute left-[11px] top-1 bottom-1 w-px overflow-hidden">
                  <motion.div
                    className="w-full origin-top"
                    style={{
                      background:
                        "linear-gradient(to bottom, oklch(0.60 0.22 220 / 0.5), oklch(0.60 0.22 220 / 0.15))",
                    }}
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.2 }}
                  />
                </div>
                <div className="space-y-3.5">
                  {steps.map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 0.5,
                        delay: 0.3 + i * 0.12,
                        ease: EASE_OUT,
                      }}
                      className="flex items-start gap-3.5 relative"
                    >
                      <div
                        className="w-[23px] h-[23px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 z-10"
                        style={{
                          background: "oklch(0.60 0.22 220 / 0.15)",
                          color: "oklch(0.77 0.17 220)",
                          border: "1px solid oklch(0.60 0.22 220 / 0.35)",
                        }}
                      >
                        {i + 1}
                      </div>
                      <span className="text-sm text-muted-foreground pt-0.5">{step}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </Reveal>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
