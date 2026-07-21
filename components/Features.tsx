const features = [
  "24/7 after-hours + overflow answering",
  "Owner email with caller info, transcript & recording the moment the call ends",
  "Commits to a real arrival window on the call — never a date-picker",
  "Emergency human hand-off, live, every time",
  "Trade-native intake for restoration, roofing & plumbing — not generic questions",
  "Call recordings + full transcripts",
  "Searchable call history with CSV export — your data stays yours",
  "One-tap kill switch — turn it off and calls ring through like before",
];

export default function Features() {
  return (
    <section className="bg-slate-50 border-y border-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
          What&apos;s included
        </h2>
        <p className="mt-3 text-slate-600 max-w-2xl">
          One flat price. No add-ons to hunt for later.
        </p>
        <ul className="mt-10 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="currentColor"
                className="mt-0.5 h-5 w-5 flex-none text-blue-600"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-slate-700">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
