import { site } from "@/lib/site-config";
import TrialForm from "./TrialForm";

const included = [
  "Setup includes carrier registration for your business",
  "Full phone setup and testing",
  "Your first month of call reviews",
];

export default function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-5xl px-6 py-24">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
          One price. Everything included.
        </h2>
        <p className="mt-3 text-slate-600">No contract. Cancel anytime.</p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:items-start">
        <div className="rounded-2xl border-2 border-slate-900 p-8">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold text-slate-900">
              ${site.pricing.monthly}
            </span>
            <span className="text-slate-500">/month</span>
          </div>
          <p className="mt-1 text-slate-600">
            + ${site.pricing.setup} one-time setup
          </p>
          <ul className="mt-6 space-y-2">
            {included.map((i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-blue-600" />
                {i}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              {site.pricing.trialDays}-day free trial
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              No contract
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              Cancel anytime
            </span>
          </div>
        </div>

        <TrialForm />
      </div>
    </section>
  );
}
