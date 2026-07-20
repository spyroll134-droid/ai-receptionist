import { site } from "@/lib/site-config";

const faqs = [
  {
    q: "Is the demo my actual phone system?",
    a: `No. The demo line runs the same setup we install for you — call it and try a real scenario to hear exactly what your callers would experience. When we install it on your business, we never touch your published number; it only picks up when your team doesn't.`,
  },
  {
    q: "Will this replace my receptionist or office staff?",
    a: "No. It's built to catch overflow only — after-hours, no-answer, and surge. Your team still answers first; the AI is the backup that used to just go to voicemail.",
  },
  {
    q: "What happens on a real emergency, like a burst pipe at 2 a.m.?",
    a: "The AI never handles a crisis alone. The moment it recognizes an emergency, it warm-transfers the caller live to your cell — you're talking to them directly.",
  },
  {
    q: "How long does setup actually take?",
    a: "About 20 minutes. We handle your carrier registration and call forwarding remotely — your number, website, and Google Business listing never change.",
  },
  {
    q: `Is there a contract?`,
    a: `No. Month-to-month, cancel anytime. Start with a ${site.pricing.trialDays}-day free trial on your real line before you pay anything.`,
  },
];

export default function FAQ() {
  return (
    <section id="faq" className="bg-slate-50 border-y border-slate-200">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 text-center">
          Questions
        </h2>
        <div className="mt-12 divide-y divide-slate-200">
          {faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-900">
                {f.q}
                <span className="ml-4 flex-none text-slate-400 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-slate-600 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
