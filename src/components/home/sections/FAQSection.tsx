import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronDown, MessageCircle } from "lucide-react";
import { useState } from "react";
import Reveal from "../primitives/Reveal";
import { cappedDelay } from "../hooks/motion";

/* ─── FAQ ───
   Two-column editorial: a sticky "Questions?" heading + support CTA on the
   left, the accordion on the right. Plain-language answers, readable width. */
export default function FAQSection() {
  const faqs = [
    { q: "What is Anavitrade?", a: "It's a trading platform that spots opportunities in the crypto market for you. You can simply receive the alerts and trade by hand, or switch on automation and let it place the trades for you — your choice." },
    { q: "What's the difference between the two tiers?", a: "Signal Delivery sends you clear Buy/Sell/Hold alerts and you decide what to do. Automated Trades connects to your account and does it all for you — how much to buy, when to take profit, and when to cut a loss." },
    { q: "Is my money safe?", a: "Yes. We can place trades but can never withdraw or move your funds — they never leave your own account. Everything sensitive is encrypted, and you can switch us off at any time." },
    { q: "Do I need to know anything about trading?", a: "No. That's the point. The engine handles the analysis and the discipline. You just choose how hands-on you want to be and watch it work from your dashboard." },
    { q: "Can I try it before using real money?", a: "Absolutely. Create a free account and explore the live signal feed and demo dashboard right away — no exchange connection and no card required." },
    { q: "What is an API key?", a: "It's a secure permission slip from your exchange that lets Anavitrade place trades on your behalf. You control what it can do — we only ever ask for trade access, never withdrawal access." },
    { q: "What if I use a Ledger hardware wallet?", a: "Fully supported. Your Ledger keeps your keys, we only get trade-only access, and your seed phrase never leaves your device. You can revoke access anytime from your own account." },
    { q: "What happens when the market gets crazy?", a: "The engine has built-in safety logic that shrinks position sizes or pauses trading during abnormal, high-risk conditions — helping protect you from flash crashes." },
  ];

  return (
    <section id="faq" className="py-32 relative">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          {/* Left: sticky heading + support */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <Reveal y={16} duration={0.5}>
                <span className="text-[0.7rem] font-medium tracking-[0.18em] uppercase text-electric mb-4 block">Support</span>
              </Reveal>
              <Reveal y={24} delay={0.05}>
                <h2 className="text-4xl sm:text-5xl font-heading font-medium tracking-[-0.035em] text-foreground mb-5">
                  Questions?
                </h2>
              </Reveal>
              <Reveal y={20} delay={0.1}>
                <p className="text-muted-foreground leading-relaxed mb-6 max-w-xs">
                  The short answers are here. Still unsure about something? We're happy to help.
                </p>
              </Reveal>
              <Reveal delay={0.15}>
                <Link href="/register">
                  <button className="btn-hairline h-11 px-5 text-sm">
                    <MessageCircle className="w-4 h-4" />
                    Talk to us
                  </button>
                </Link>
              </Reveal>
            </div>
          </div>

          {/* Right: accordion */}
          <div className="lg:col-span-8 space-y-2">
            {faqs.map((faq, i) => (
              <Reveal key={i} delay={cappedDelay(i, 0.05)}>
                <FAQItem question={faq.q} answer={faq.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors duration-200 ${open ? "border-primary/20 bg-white/[0.02]" : "border-border/50 hover:border-border"}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left" aria-expanded={open}>
        <span className="text-sm font-medium text-foreground pr-4">{question}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </motion.div>
      </button>
      <motion.div initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }} className="overflow-hidden">
        <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed max-w-2xl">{answer}</p>
      </motion.div>
    </div>
  );
}
