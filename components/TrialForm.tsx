"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function TrialForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/trial-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center">
        <p className="text-lg font-semibold text-slate-900">
          You&apos;re in — we&apos;ll text you shortly to set up your trial.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-slate-50 border border-slate-200 p-8 space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="trial-company"
            className="block text-sm font-medium text-slate-700"
          >
            Company name
          </label>
          <input
            required
            id="trial-company"
            name="companyName"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label
            htmlFor="trial-contact"
            className="block text-sm font-medium text-slate-700"
          >
            Your name
          </label>
          <input
            required
            id="trial-contact"
            name="contactName"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label
            htmlFor="trial-phone"
            className="block text-sm font-medium text-slate-700"
          >
            Phone
          </label>
          <input
            required
            id="trial-phone"
            type="tel"
            name="phone"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label
            htmlFor="trial-email"
            className="block text-sm font-medium text-slate-700"
          >
            Email (optional)
          </label>
          <input
            id="trial-email"
            type="email"
            name="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor="trial-trade"
          className="block text-sm font-medium text-slate-700"
        >
          Trade
        </label>
        <select
          id="trial-trade"
          name="trade"
          defaultValue="Restoration"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option>Restoration</option>
          <option>Roofing</option>
          <option>Plumbing</option>
        </select>
      </div>
      {/* Unchecked by default and required: an affirmative act, not a
          pre-ticked box, is what counts as consent. */}
      <div className="flex items-start gap-3">
        <input
          required
          id="trial-tos"
          name="tosAccepted"
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor="trial-tos" className="text-sm text-slate-700">
          I agree to the{" "}
          <a
            href="/terms-of-service"
            className="underline hover:text-slate-900"
            target="_blank"
            rel="noopener"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy-policy"
            className="underline hover:text-slate-900"
            target="_blank"
            rel="noopener"
          >
            Privacy Policy
          </a>
          .
        </label>
      </div>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
      >
        {status === "submitting" ? "Submitting…" : "Start your free trial"}
      </button>
      {status === "error" && (
        <p className="text-sm text-red-600">
          Something went wrong — call or email us instead, links below.
        </p>
      )}
      <p className="text-xs text-slate-500 text-center">
        No card required. 7 days on your real line, cancel anytime.
      </p>
      <p className="text-xs text-slate-500 text-center">
        By submitting, you agree to receive calls and texts from us about
        your trial setup. Msg & data rates may apply, reply STOP to opt
        out. See our{" "}
        <a href="/privacy-policy" className="underline hover:text-slate-700">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
