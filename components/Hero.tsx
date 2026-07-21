import { site, tradesLabel } from "@/lib/site-config";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(59,130,246,0.25), transparent)",
        }}
      />
      <div className="relative mx-auto max-w-4xl px-6 py-24 sm:py-32 text-center">
        <p className="text-sm font-medium text-blue-300 uppercase tracking-wide">
          Built for {tradesLabel()} companies
        </p>
        <h1 className="mt-4 text-4xl sm:text-6xl font-semibold tracking-tight text-balance">
          Your team already answers most calls.{" "}
          <br className="hidden sm:block" />
          This catches the ones they don&apos;t.
        </h1>
        <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto text-balance">
          An AI receptionist that picks up after-hours, during storms, and
          when your lines are already full — qualifies the emergency, commits
          to a real arrival window, and emails you the full lead before the
          caller hangs up.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={site.demoPhoneHref}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-base font-semibold text-slate-900 hover:bg-slate-200 transition-colors"
          >
            Call {site.demoPhoneDisplay}
          </a>
          <a
            href="#pricing"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-slate-600 px-6 py-3 text-base font-semibold text-white hover:bg-white/10 transition-colors"
          >
            See pricing
          </a>
        </div>
        <p className="mt-6 text-sm text-slate-400">
          Tell it you&apos;ve got a flooded basement — hear exactly what your
          customers would.
        </p>
      </div>
    </section>
  );
}
