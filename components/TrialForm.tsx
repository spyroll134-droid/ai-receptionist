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
          <label className="block text-sm font-medium text-slate-700">
            Company name
          </label>
          <input
            required
            name="companyName"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Your name
          </label>
          <input
            required
            name="contactName"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Phone
          </label>
          <input
            required
            type="tel"
            name="phone"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Email (optional)
          </label>
          <input
            type="email"
            name="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Trade
        </label>
        <select
          name="trade"
          defaultValue="Restoration"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option>Restoration</option>
          <option>Roofing</option>
          <option>Plumbing</option>
        </select>
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
    </form>
  );
}
