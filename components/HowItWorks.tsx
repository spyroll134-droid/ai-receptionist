const steps = [
  {
    n: "1",
    title: "Your number stays yours",
    body: "Nothing to port, nothing to change on your trucks, website, or Google listing. We forward calls to us only when your team doesn't pick up.",
  },
  {
    n: "2",
    title: "The AI answers — disclosed, up front",
    body: "It asks what actually matters for your trade: standing water and insurance carrier for restoration, storm date and roof age for roofing, active leak status for plumbing.",
  },
  {
    n: "3",
    title: "You get the job, not just a message",
    body: "The AI commits to a real arrival window — never a date-picker — and emails you the caller's details before you've even seen the missed call.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-24">
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
        How it works
      </h2>
      <div className="mt-12 grid gap-10 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white font-semibold">
              {s.n}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              {s.title}
            </h3>
            <p className="mt-2 text-slate-600 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
