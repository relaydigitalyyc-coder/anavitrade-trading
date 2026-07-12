import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Wallet, CheckCircle2, X } from "lucide-react";

interface FirstRunWizardProps {
  showWizard: boolean;
  wizardStep: number;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
}

const wizardSteps = [
  { title: "Welcome to Anavitrade", desc: "You're in Demo mode — the portfolio below shows simulated paper trades from our live signals. Try it out.", icon: <Sparkles className="w-6 h-6" /> },
  { title: "Connect a wallet", desc: "Link a wallet to activate DEX execution. Your funds stay in your own account — we never get withdrawal access.", icon: <Wallet className="w-6 h-6" /> },
  { title: "You're all set", desc: "Toggle between Demo and Live mode anytime from the top bar. Let's start trading.", icon: <CheckCircle2 className="w-6 h-6" /> },
];

export default function FirstRunWizard({ showWizard, wizardStep, onClose, onBack, onNext }: FirstRunWizardProps) {
  return (
    <AnimatePresence>
      {showWizard && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "oklch(0.07 0.015 255 / 0.85)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-md rounded-2xl p-8 border"
            style={{ background: "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.95), oklch(0.09 0.018 255 / 0.98))", borderColor: "oklch(0.60 0.22 220 / 0.18)" }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Step indicator */}
            <div className="flex gap-2 mb-6">
              {wizardSteps.map((_, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-all duration-500"
                  style={{ background: i <= wizardStep ? "oklch(0.60 0.22 220 / 0.6)" : "oklch(1 0 0 / 0.08)" }}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={wizardStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: "oklch(0.60 0.22 220 / 0.12)", color: "oklch(0.68 0.22 220)" }}>
                  {wizardSteps[wizardStep].icon}
                </div>
                <h2 className="text-xl font-heading font-bold text-foreground mb-2">{wizardSteps[wizardStep].title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-8">{wizardSteps[wizardStep].desc}</p>
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center gap-3">
              {wizardStep > 0 && (
                <button
                  onClick={onBack}
                  className="flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium text-foreground transition-colors hover:bg-card"
                  style={{ borderColor: "oklch(0.60 0.22 220 / 0.2)" }}
                >
                  Back
                </button>
              )}
              <button
                onClick={onNext}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ fontFamily: "var(--font-heading)", color: "oklch(0.14 0.02 255)", background: "var(--grad-arctic)", boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.4), 0 4px 24px oklch(0.72 0.20 195 / 0.22)" }}
              >
                {wizardStep < wizardSteps.length - 1 ? "Next" : "Get Started"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
