import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import MathSection from "@/components/MathSection";
import DemoCallout from "@/components/DemoCallout";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <MathSection />
        <DemoCallout />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
