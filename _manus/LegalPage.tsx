import { Link } from "wouter";
import { motion } from "framer-motion";
import { Shield, ArrowLeft } from "lucide-react";

const TERMS_CONTENT = {
  title: "Terms of Service",
  lastUpdated: "July 2026",
  sections: [
    {
      heading: "1. Acceptance of Terms",
      body: "By accessing or using the Anavitrade platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform.",
    },
    {
      heading: "2. Non-Custodial Nature of the Service",
      body: "Anavitrade is a non-custodial algorithmic trade signal service. We do not hold, control, or have access to your funds at any time. All assets remain in your own wallet or exchange account. Anavitrade only transmits trade signals; execution requires your explicit approval on your device.",
    },
    {
      heading: "3. Risk Disclosure",
      body: "Trading perpetual futures and other financial instruments involves significant risk of loss. Past performance of any algorithm or signal is not indicative of future results. You may lose some or all of your invested capital. Only trade with funds you can afford to lose.",
    },
    {
      heading: "4. API Wallet & Permissions",
      body: "When you connect an API wallet or Web3 wallet, you grant Anavitrade permission to submit trade orders on your behalf within the risk parameters you configure. You may revoke this permission at any time. Anavitrade will never request withdrawal permissions, transfer permissions, or access to your private keys.",
    },
    {
      heading: "5. Prohibited Activities",
      body: "You may not use the platform for market manipulation, wash trading, or any activity that violates applicable laws or the terms of any connected exchange. Accounts found engaging in prohibited activities will be suspended immediately.",
    },
    {
      heading: "6. Limitation of Liability",
      body: "To the maximum extent permitted by law, Anavitrade shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform, including but not limited to trading losses, missed opportunities, or technical failures.",
    },
    {
      heading: "7. Modifications",
      body: "We reserve the right to modify these terms at any time. Continued use of the platform after changes constitutes acceptance of the updated terms. We will notify users of material changes via email.",
    },
    {
      heading: "8. Governing Law",
      body: "These terms shall be governed by and construed in accordance with applicable law. Any disputes shall be resolved through binding arbitration.",
    },
  ],
};

const PRIVACY_CONTENT = {
  title: "Privacy Policy",
  lastUpdated: "July 2026",
  sections: [
    {
      heading: "1. Information We Collect",
      body: "We collect information you provide directly: name, email address, and account credentials. We also collect wallet addresses (public keys only — never private keys), trade activity data routed through our signal system, and standard usage analytics such as page views and session duration.",
    },
    {
      heading: "2. How We Use Your Information",
      body: "Your information is used to operate the platform, deliver trade signals to your connected wallet, send account notifications, and improve our services. We do not sell your personal data to third parties.",
    },
    {
      heading: "3. API Keys & Wallet Security",
      body: "Any API keys you provide are encrypted at rest using AES-256 encryption. Private keys are never requested, stored, or transmitted. Wallet addresses are stored as public identifiers only. You may revoke all wallet connections at any time from your account settings.",
    },
    {
      heading: "4. Data Retention",
      body: "We retain your account data for as long as your account is active. Trade history and signal logs are retained for up to 24 months for performance reporting purposes. You may request deletion of your account and associated data at any time.",
    },
    {
      heading: "5. Third-Party Services",
      body: "We integrate with third-party services including Hyperliquid (trade execution), WalletConnect (wallet connectivity), and analytics providers. These services have their own privacy policies which govern their use of your data.",
    },
    {
      heading: "6. Cookies",
      body: "We use session cookies to maintain your authenticated state. We do not use tracking cookies for advertising purposes. You may disable cookies in your browser settings, though this may affect platform functionality.",
    },
    {
      heading: "7. Your Rights",
      body: "You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at privacy@anavitrade.com. We will respond to all requests within 30 days.",
    },
    {
      heading: "8. Security",
      body: "We implement industry-standard security measures including TLS encryption in transit, AES-256 encryption at rest, and regular security audits. However, no system is completely secure and we cannot guarantee absolute security.",
    },
  ],
};

interface LegalPageProps {
  type: "terms" | "privacy";
}

export default function LegalPage({ type }: LegalPageProps) {
  const content = type === "terms" ? TERMS_CONTENT : PRIVACY_CONTENT;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-4 sticky top-0 z-40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center font-bold text-primary-foreground text-sm group-hover:scale-105 transition-transform">@</div>
              <span className="font-heading font-bold text-foreground hidden sm:block">Anavitrade</span>
            </div>
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-primary" />
            Legal
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          {/* Back link */}
          <Link href="/">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 cursor-pointer group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              Back to home
            </div>
          </Link>

          {/* Title */}
          <div className="mb-10">
            <h1 className="text-4xl font-heading font-bold text-foreground mb-3">{content.title}</h1>
            <p className="text-muted-foreground text-sm">Last updated: {content.lastUpdated}</p>
          </div>

          {/* Intro box */}
          <div className="p-5 rounded-2xl mb-10"
            style={{ background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.12)" }}>
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                {type === "terms"
                  ? "These terms govern your use of the Anavitrade platform. Anavitrade is a non-custodial service — your funds remain under your sole control at all times."
                  : "Anavitrade is committed to protecting your privacy. We never sell your data, never access your private keys, and never hold custody of your funds."}
              </p>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {content.sections.map((section, i) => (
              <motion.div
                key={section.heading}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="pb-8 border-b border-border/30 last:border-0"
              >
                <h2 className="text-base font-semibold text-foreground mb-3">{section.heading}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">{section.body}</p>
              </motion.div>
            ))}
          </div>

          {/* Footer nav */}
          <div className="mt-12 pt-8 border-t border-border/30 flex items-center justify-between flex-wrap gap-4">
            <p className="text-xs text-muted-foreground">
              Questions? Contact us at{" "}
              <a href="mailto:legal@anavitrade.com" className="text-primary hover:underline">legal@anavitrade.com</a>
            </p>
            <div className="flex items-center gap-4 text-xs">
              {type === "privacy" ? (
                <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link>
              ) : (
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link>
              )}
              <Link href="/security" className="text-muted-foreground hover:text-foreground transition-colors">Security</Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
