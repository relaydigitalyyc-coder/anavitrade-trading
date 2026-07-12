import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronDown, Menu, X, Zap, Shield, BarChart3, HardDrive, Users, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const productLinks = [
  { href: "#strategy", icon: BarChart3, label: "Trading Algorithm", desc: "4h confluence signals" },
  { href: "#about", icon: Zap, label: "Automation", desc: "Non-custodial copytrade" },
  { href: "#why-choose", icon: Shield, label: "Security Model", desc: "Keys never leave device" },
  { href: "/onboarding/ledger", icon: HardDrive, label: "Ledger Setup", desc: "5-step onboarding" },
];

const companyLinks = [
  { href: "#about", icon: Users, label: "About Us", desc: "Our mission" },
  { href: "#testimonials", icon: BarChart3, label: "Testimonials", desc: "What traders say" },
  { href: "#faq", icon: HelpCircle, label: "FAQ", desc: "Common questions" },
];

function DropdownMenu({ links }: { links: typeof productLinks }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-60 rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.95), oklch(0.09 0.018 255 / 0.98))",
        backdropFilter: "blur(32px) saturate(180%)",
        WebkitBackdropFilter: "blur(32px) saturate(180%)",
        border: "1px solid oklch(0.60 0.22 220 / 0.20)",
        boxShadow: "0 24px 48px oklch(0.07 0.015 255 / 0.7), 0 0 0 1px oklch(0.60 0.22 220 / 0.08) inset",
      }}
    >
      <div className="p-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group"
            style={{ color: "oklch(0.96 0.006 220)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "oklch(0.60 0.22 220 / 0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "oklch(0.60 0.22 220 / 0.12)", border: "1px solid oklch(0.60 0.22 220 / 0.20)" }}>
              <link.icon className="w-3.5 h-3.5" style={{ color: "oklch(0.68 0.20 220)" }} />
            </div>
            <div>
              <div className="text-sm font-medium" style={{ fontFamily: "var(--font-heading)" }}>{link.label}</div>
              <div className="text-xs mt-0.5" style={{ color: "oklch(0.55 0.020 240)" }}>{link.desc}</div>
            </div>
          </a>
        ))}
      </div>
    </motion.div>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      style={scrolled ? {
        background: "linear-gradient(180deg, oklch(0.09 0.018 255 / 0.88), oklch(0.08 0.016 255 / 0.92))",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderBottom: "1px solid oklch(0.60 0.22 220 / 0.12)",
        boxShadow: "0 8px 32px oklch(0.07 0.015 255 / 0.4)",
      } : {}}
    >
      <div className="container flex items-center justify-between h-[72px]">

        {/* Logo */}
        <Link href="/" className="flex items-center group">
          <img
            src="/manus-storage/anavi-logo-wordmark_51f8821a.png"
            alt="@navi"
            className="h-9 w-auto object-contain transition-opacity duration-200 group-hover:opacity-80"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {/* Product */}
          <div className="relative"
            onMouseEnter={() => setProductOpen(true)}
            onMouseLeave={() => setProductOpen(false)}>
            <button className="flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
              style={{ color: productOpen ? "oklch(0.96 0.006 220)" : "oklch(0.60 0.020 240)", fontFamily: "var(--font-sans)" }}>
              Product
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${productOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {productOpen && <DropdownMenu links={productLinks} />}
            </AnimatePresence>
          </div>

          {/* Company */}
          <div className="relative"
            onMouseEnter={() => setCompanyOpen(true)}
            onMouseLeave={() => setCompanyOpen(false)}>
            <button className="flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
              style={{ color: companyOpen ? "oklch(0.96 0.006 220)" : "oklch(0.60 0.020 240)", fontFamily: "var(--font-sans)" }}>
              Company
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${companyOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {companyOpen && <DropdownMenu links={companyLinks} />}
            </AnimatePresence>
          </div>

          {/* Signals link */}
          <a href="#bangers" className="text-sm font-medium transition-colors duration-200"
            style={{ color: "oklch(0.60 0.020 240)", fontFamily: "var(--font-sans)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.96 0.006 220)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "oklch(0.60 0.020 240)")}>
            Live Signals
          </a>
        </div>

        {/* CTA Buttons */}
        <div className="hidden md:flex items-center gap-2.5">
          <Link href="/login">
            <button className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                fontFamily: "var(--font-heading)",
                color: "oklch(0.77 0.17 220)",
                border: "1px solid oklch(0.60 0.22 220 / 0.20)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "oklch(0.60 0.22 220 / 0.08)";
                e.currentTarget.style.borderColor = "oklch(0.60 0.22 220 / 0.40)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "oklch(0.60 0.22 220 / 0.20)";
              }}>
              Login
            </button>
          </Link>
          <Link href="/register">
            <button className="btn-azure px-5 py-2 rounded-xl text-sm">
              Get Started
            </button>
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden p-2 rounded-lg transition-colors"
          style={{ color: "oklch(0.96 0.006 220)" }}
          onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="md:hidden overflow-hidden"
            style={{
              background: "linear-gradient(180deg, oklch(0.09 0.018 255 / 0.96), oklch(0.08 0.016 255 / 0.98))",
              backdropFilter: "blur(24px)",
              borderTop: "1px solid oklch(0.60 0.22 220 / 0.12)",
            }}>
            <div className="p-5 flex flex-col gap-1">
              {[
                { href: "#about", label: "About" },
                { href: "#strategy", label: "Strategy" },
                { href: "#bangers", label: "Live Signals" },
                { href: "#why-choose", label: "Why Choose Us" },
                { href: "#faq", label: "FAQ" },
              ].map((item) => (
                <a key={item.href} href={item.href}
                  className="px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ color: "oklch(0.70 0.015 240)", fontFamily: "var(--font-sans)" }}
                  onClick={() => setMobileOpen(false)}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.96 0.006 220)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "oklch(0.70 0.015 240)")}>
                  {item.label}
                </a>
              ))}
              <div className="flex gap-3 pt-4 mt-2" style={{ borderTop: "1px solid oklch(0.60 0.22 220 / 0.12)" }}>
                <Link href="/register" className="flex-1">
                  <button className="btn-azure w-full px-4 py-2.5 rounded-xl text-sm">Get Started</button>
                </Link>
                <Link href="/login" className="flex-1">
                  <button className="btn-ghost-azure w-full px-4 py-2.5 rounded-xl text-sm">Login</button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
