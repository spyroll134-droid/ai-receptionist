import { site } from "@/lib/site-config";

// Positioning note: this section used to compare $297 against a $4,000/mo
// human answering service. That comparison is a decade out of date and it
// actively armed the objection — a prospect who Googles "AI receptionist"
// finds Rosie at $49 and Goodcall at $59 in about thirty seconds, then reads
// a page anchoring him on price and discovers we're the expensive one.
//
// The honest frame is service vs software. Those tools hand you a dashboard;
// this is installed and tuned for you. Naming the cheap tier ourselves is
// deliberate: it's the first thing he'll check anyway, and pre-empting it
// reads as confidence rather than something we hoped he'd miss.

const columns = [
  {
    label: "Self-serve AI tools",
    price: "$49–65",
    unit: "/mo",
    body: "You write the script, you configure the forwarding, you test it, you fix it when it mishandles a burst pipe at 2 a.m.",
    tone: "muted" as const,
  },
  {
    label: site.businessName,
    price: `$${site.pricing.monthly}`,
    unit: "/mo",
    body: "We install it on your line, test it with a live call, and tune the intake for your trade. You never open a settings page.",
    tone: "primary" as const,
  },
  {
    label: "Human answering service",
    price: `$${site.humanAnsweringServiceMonthly.toLocaleString()}`,
    unit: "/mo",
    body: "A stranger reads a script, takes a message, and doesn't know what standing water means.",
    tone: "muted" as const,
  },
];

export default function MathSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 text-balance">
          Cheaper tools exist. They also expect you to build it.
        </h2>
        <p className="mt-4 text-slate-600 max-w-2xl mx-auto text-balance">
          There are AI receptionists for fifty dollars a month. They&apos;re
          software — you set them up. This is the same technology, installed
          and maintained for you, with an intake script written for
          restoration work specifically.
        </p>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-3 sm:items-stretch">
        {columns.map((c) => (
          <div
            key={c.label}
            className={
              c.tone === "primary"
                ? "rounded-2xl border-2 border-slate-900 p-8 shadow-sm"
                : "rounded-2xl border border-slate-200 p-8"
            }
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p
              className={`mt-2 text-4xl font-semibold ${
                c.tone === "primary" ? "text-slate-900" : "text-slate-400"
              }`}
            >
              {c.price}
              <span className="text-xl">{c.unit}</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{c.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-12 text-lg text-slate-600 max-w-2xl mx-auto text-balance text-center">
        One caught emergency call is worth thousands — a restoration job, a
        storm-damage roof, an emergency plumbing call. One job pays for the
        entire year. Everything after that is margin you were losing to
        voicemail.
      </p>
    </section>
  );
}
