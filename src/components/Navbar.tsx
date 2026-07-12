import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Menu, X, Zap, Shield, BarChart3, HardDrive, Users, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Wordmark from "./Wordmark";

function scrollToAnchor(hash: string) {
  if (typeof document === "undefined") return;
  setTimeout(() => {
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, 100);
}

const productLinks = [
  { href: "/#strategy", icon: BarChart3, label: "Trading Algorithm", desc: "4h confluence signals" },
  { href: "/#about", icon: Zap, label: "Automation", desc: "Non-custodial copytrade" },
  { href: "/#why-choose", icon: Shield, label: "Security Model", desc: "Keys never leave device" },
  { href: "/onboarding/ledger", icon: HardDrive, label: "Ledger Setup", desc: "5-step onboarding", protected: true },
];

const companyLinks = [
  { href: "/#about", icon: Users, label: "About Us", desc: "Our mission" },
  { href: "/#testimonials", icon: BarChart3, label: "Testimonials", desc: "What traders say" },
  { href: "/#faq", icon: HelpCircle, label: "FAQ", desc: "Common questions" },
];

const mobileLinks = [
  { href: "/#about", label: "About" },
  { href: "/#strategy", label: "Strategy" },
  { href: "/#bangers", label: "Live Signals" },
  { href: "/#why-choose", label: "Why Choose Us" },
  { href: "/#faq", label: "FAQ" },
];

function DropdownMenu({ links, isAuthenticated }: { links: typeof productLinks; isAuthenticated: boolean }) {
  const [, navigate] = useLocation();

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
        {links.map((link) => {
          const isExternal = link.href.startsWith("/") && !link.href.startsWith("/#");
          const handleClick = (e: React.MouseEvent) => {
            if (link.href.startsWith("/#")) {
              e.preventDefault();
              if (window.location.pathname === "/") {
                scrollToAnchor(link.href.substring(1));
              } else {
                navigate("/");
                setTimeout(() => scrollToAnchor(link.href.substring(1)), 300);
              }
            }
          };
          return (
            <a
              key={link.href}
              href={link.href}
              onClick={handleClick}
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
          );
        })}
      </div>
    </motion.div>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleAnchor = (href: string) => (e: React.MouseEvent) => {
    if (href.startsWith("/#")) {
      e.preventDefault();
      if (window.location.pathname === "/") {
        scrollToAnchor(href.substring(1));
      } else {
        navigate(href);
      }
    }
  };

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
        <Wordmark size="md" />

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <div className="relative"
            onMouseEnter={() => setProductOpen(true)}
            onMouseLeave={() => setProductOpen(false)}>
            <button className="flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
              style={{ color: productOpen ? "oklch(0.96 0.006 220)" : "oklch(0.60 0.020 240)", fontFamily: "var(--font-sans)" }}>
              Product
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${productOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {productOpen && <DropdownMenu links={productLinks} isAuthenticated={false} />}
            </AnimatePresence>
          </div>

          <div className="relative"
            onMouseEnter={() => setCompanyOpen(true)}
            onMouseLeave={() => setCompanyOpen(false)}>
            <button className="flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
              style={{ color: companyOpen ? "oklch(0.96 0.006 220)" : "oklch(0.60 0.020 240)", fontFamily: "var(--font-sans)" }}>
              Company
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${companyOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {companyOpen && <DropdownMenu links={companyLinks} isAuthenticated={false} />}
            </AnimatePresence>
          </div>

          <a href="/#bangers" onClick={handleAnchor("/#bangers")} className="text-sm font-medium transition-colors duration-200"
            style={{ color: "oklch(0.60 0.020 240)", fontFamily: "var(--font-sans)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.96 0.006 220)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "oklch(0.60 0.020 240)")}>
            Live Signals
          </a>
        </div>

        {/* Desktop CTA — hairline system, matches hero */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login">
            <button className="btn-hairline h-10 px-5 text-[0.9rem]">Login</button>
          </Link>
          <Link href="/register">
            <button
              className="h-10 px-5 rounded-[100px] text-[0.9rem] font-medium transition-transform active:scale-[0.98]"
              style={{
                fontFamily: "var(--font-heading)",
                color: "oklch(0.14 0.02 255)",
                background: "var(--grad-arctic)",
                boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.4), 0 4px 20px oklch(0.72 0.20 195 / 0.2)",
              }}
            >
              Get Started
            </button>
          </Link>
        </div>

        {/* Mobile Hamburger — Foldcraft animated */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="relative z-50 flex md:hidden items-center justify-center w-10 h-10 text-white active:scale-90 transition-transform"
          aria-label="Toggle menu"
        >
          <div className="absolute inset-0 flex items-center justify-center transition-all duration-300"
            style={{
              opacity: mobileOpen ? 0 : 1,
              transform: mobileOpen ? "rotate(90deg) scale(0.5)" : "rotate(0deg) scale(1)",
            }}
          >
            <Menu className="w-5 h-5" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center transition-all duration-300"
            style={{
              opacity: mobileOpen ? 1 : 0,
              transform: mobileOpen ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.5)",
            }}
          >
            <X className="w-5 h-5" />
          </div>
        </button>
      </div>

      {/* Mobile Menu — full-screen overlay */}
      <div
        className="fixed inset-x-0 top-0 z-40 flex flex-col justify-center px-8 transition-all duration-500 md:hidden"
        style={{
          height: mobileOpen ? "100vh" : "0",
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? "auto" : "none",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          background: "oklch(0.07 0.015 255 / 0.98)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
        }}
      >
        <div className="flex flex-col gap-6"
          style={{
            opacity: mobileOpen ? 1 : 0,
            transform: mobileOpen ? "translateY(0)" : "translateY(8px)",
            transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s",
          }}
        >
          {mobileLinks.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              className="text-3xl font-medium text-white/90 hover:text-white transition-colors"
              style={{ fontFamily: "var(--font-heading)" }}
              onClick={(e) => {
                handleAnchor(link.href)(e);
                setMobileOpen(false);
              }}
            >
              {link.label}
            </a>
          ))}
          <div className="flex gap-3 pt-6 mt-4" style={{ borderTop: "1px solid oklch(0.60 0.22 220 / 0.12)" }}>
            <Link href="/register" className="flex-1">
              <button className="btn-azure w-full px-4 py-3 rounded-xl text-sm" onClick={() => setMobileOpen(false)}>
                Get Started
              </button>
            </Link>
            <Link href="/login" className="flex-1">
              <button className="btn-ghost-azure w-full px-4 py-3 rounded-xl text-sm" onClick={() => setMobileOpen(false)}>
                Login
              </button>
            </Link>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
