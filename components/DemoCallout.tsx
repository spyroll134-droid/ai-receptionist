import { site } from "@/lib/site-config";

// Same trade-awareness as the hero: the scenario has to be the one THEY get
// called about at 2am, or the demo proves the line answers without proving it
// understands their work.

export default function DemoCallout({
  trade,
}: {
  trade?: keyof typeof site.tradePages;
}) {
  const emergency = trade
    ? site.tradePages[trade].emergency
    : "standing water in the basement from a burst pipe";

  return (
    <section className="bg-blue-600">
      <div className="mx-auto max-w-4xl px-6 py-16 text-center text-white">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Don&apos;t take our word for it — call it
        </h2>
        <p className="mt-4 text-blue-100 max-w-xl mx-auto">
          Dial the number below and tell it you&apos;ve got {emergency}. Answer
          its questions like a real caller would. That&apos;s the whole demo.
        </p>
        <a
          href={site.demoPhoneHref}
          className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-xl font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
        >
          {site.demoPhoneDisplay}
        </a>
      </div>
    </section>
  );
}
