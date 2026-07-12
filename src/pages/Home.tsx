import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HeroSection from "@/components/home/sections/HeroSection";
import SignalTicker from "@/components/home/sections/SignalTicker";
import RecentWins from "@/components/home/sections/RecentWins";
import LogoBar from "@/components/home/sections/LogoBar";
import HowItHelps from "@/components/home/sections/HowItHelps";
import SignalPipeline from "@/components/home/sections/SignalPipeline";
import LedgerSection from "@/components/home/sections/LedgerSection";
import HowItWorksSection from "@/components/home/sections/HowItWorksSection";
import ProofBar from "@/components/home/sections/ProofBar";
import Performance from "@/components/home/sections/Performance";
import PricingSection from "@/components/home/sections/PricingSection";
import TestimonialsSection from "@/components/home/sections/TestimonialsSection";
import FAQSection from "@/components/home/sections/FAQSection";
import CTASection from "@/components/home/sections/CTASection";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <SignalTicker />
      <RecentWins />
      <LogoBar />
      <HowItHelps />
      <SignalPipeline />
      <LedgerSection />
      <HowItWorksSection />
      <ProofBar />
      <Performance />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  );
}
