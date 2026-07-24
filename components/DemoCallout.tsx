import { site } from "@/lib/site-config";

// The burst-pipe scenario is the demo script for everyone, not because every
// caller is a restoration company but because it's the emergency a stranger can
// act out convincingly without knowing the trade. What it proves is the thing
// under test: the line picks up, qualifies, and hands over a real lead.

export default function DemoCallout() {
  const emergency = "standing water in the basement from a burst pipe";

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
