import { site } from "@/lib/site-config";

export default function MathSection() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
        The math is not close
      </h2>
      <div className="mt-12 grid gap-6 sm:grid-cols-3 items-center">
        <div className="rounded-2xl border border-slate-200 p-8">
          <p className="text-sm text-slate-500">A human answering service</p>
          <p className="mt-2 text-4xl font-semibold text-slate-400 line-through">
            ${site.humanAnsweringServiceMonthly.toLocaleString()}/mo
          </p>
        </div>
        <div className="text-2xl text-slate-400 font-medium">vs.</div>
        <div className="rounded-2xl border-2 border-slate-900 p-8">
          <p className="text-sm text-slate-500">{site.businessName}</p>
          <p className="mt-2 text-4xl font-semibold text-slate-900">
            ${site.pricing.monthly}/mo
          </p>
        </div>
      </div>
      <p className="mt-10 text-lg text-slate-600 max-w-2xl mx-auto text-balance">
        One caught emergency call is worth thousands — a restoration job,
        a storm-damage roof, an emergency plumbing call. One job pays for
        the entire year. Everything after that is margin you were losing
        to voicemail.
      </p>
    </section>
  );
}
