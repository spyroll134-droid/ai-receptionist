import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { site } from "@/lib/site-config";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import MathSection from "@/components/MathSection";
import DemoCallout from "@/components/DemoCallout";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

// One landing page per trade — /for/roofing, /for/plumbing, /for/restoration.
//
// Same product, same sections, different words. The point isn't the copy, it's
// the shape: a visitor only ever sees their own trade, so adding a fourth
// never edits the page the first three were sold on. Expansion is additive.
//
// Namespaced under /for/ deliberately. A bare [trade] segment at the root would
// match every unclaimed path on the site, so a typo'd URL would render a
// landing page instead of a 404 — and any future top-level route would have to
// out-specify a catch-all to exist.
//
// Unknown trades 404 rather than falling through to a generic page: an
// unrecognised slug means a stale link or a guess, and a page that quietly
// pretends to be about the visitor's trade is worse than no page.

type Slug = keyof typeof site.tradePages;

const slugs = Object.keys(site.tradePages) as Slug[];

export function generateStaticParams() {
  return slugs.map((trade) => ({ trade }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trade: string }>;
}): Promise<Metadata> {
  const { trade } = await params;
  const page = site.tradePages[trade as Slug];
  if (!page) return {};
  const label = page.trade.toLowerCase();
  return {
    title: `AI receptionist for ${label} companies — ${site.businessName}`,
    description: `${site.businessName} answers the ${label} calls your team drops — after-hours, during storms, and when the lines are full. Qualifies the emergency and emails you the lead before the caller hangs up.`,
  };
}

export default async function TradeLanding({
  params,
}: {
  params: Promise<{ trade: string }>;
}) {
  const { trade } = await params;
  if (!slugs.includes(trade as Slug)) notFound();
  const slug = trade as Slug;

  return (
    <>
      <Nav />
      <main>
        <Hero trade={slug} />
        <HowItWorks />
        <Features />
        <MathSection />
        <DemoCallout trade={slug} />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
