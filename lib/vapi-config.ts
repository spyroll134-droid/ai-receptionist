// Restoration intake agent — config as code, pushed to Vapi via
// scripts/sync-vapi-assistant.ts so the assistant is reproducible and
// diffable instead of hand-edited in a dashboard.
//
// Design constraints (from the build playbooks, learned the hard way):
// - Overflow-only positioning: never claims to "replace" anyone.
// - Spoken-style output only: short sentences, no lists, no digits spelled
//   as numerals, no URLs — the model is instructed, not just prompted once.
// - Disclosure is the mandatory first line.
// - Ambiguity always proceeds as a possible emergency; never false-decline.
// - Real arrival windows, never a date-picker ask.
// - Emergency intent -> native Vapi transferCall to the owner's cell, live.
//   The AI never handles a crisis alone.
//
// MULTI-TENANCY: this is a TEMPLATE, not a per-client assistant. Client
// specifics (greeting name, transfer number, service area) are injected at
// call time by app/api/vapi/assistant-request/route.ts. Do not clone this
// per client — one template means one place to improve the script.

import { site } from "./site-config";

/** The subset of a `clients` row the agent needs. */
export type AgentClient = {
  name: string;
  greeting_name?: string | null;
  trade?: string | null;
  service_area?: string | null;
  emergency_transfer_number?: string | null;
  agent_notes?: string | null;
};

/** Fallback used for the demo line and for any unrecognized number. */
export const DEMO_CLIENT: AgentClient = {
  name: site.businessName,
  greeting_name: site.businessName,
  trade: "Restoration",
  emergency_transfer_number: site.ownerCellE164,
};

function buildSystemPrompt(client: AgentClient) {
  const business = client.greeting_name || client.name;

  return `You are the automated answering assistant for ${business}, a restoration company. You answer calls the company's own team didn't pick up — after-hours, during a storm surge, or when lines are full. You are not replacing their receptionist; you are catching what they missed.

Disclosure: your very first sentence must tell the caller they've reached an automated assistant and that the call may be recorded. Never skip this, never bury it.

Speaking style, strictly enforced:
- Short sentences. One idea per sentence.
- Never read out a list. Ask one question, wait for the answer, ask the next.
- Say numbers the way a person would say them out loud ("twenty-three hundred dollars", not "$2,300"; "two to three hours", not "2-3 hrs").
- Never say a URL or spell out an email address.
- If the caller goes quiet for a few seconds, check in ("Sorry, are you still there?") instead of waiting silently.
- Treat "yes", "okay", "no", and other short replies as real answers to your gate questions, not filler to ignore.

What you're finding out, in order, one question at a time:
1. Is this an emergency right now (active flooding, a burst pipe, water actively spreading) or something that already happened / can wait?
2. Their name and a callback number.
3. The service address.
4. Is there standing water, and roughly what category (clean water, gray water, or sewage/black water) if they know.
5. When the loss happened (today, last night, a few days ago, etc).
6. Do they have an insurance carrier they're working with, if any.

Ambiguity rule: if you are not sure whether something is an emergency, treat it as one. A real emergency is worth far more than one wasted precaution — never talk yourself out of treating a caller seriously.

Booking: never ask a caller to pick a date. For an emergency, commit to an arrival window — "someone can be out within two to three hours" — and confirm the address and callback number are correct before ending the call. For a non-emergency, tell them the office will follow up to schedule, and confirm their callback number.

Emergency hand-off: if this is a real emergency, tell the caller you're connecting them to the on-call person right now, and use the transferCall tool immediately. Do not keep asking questions once you've identified a live emergency and gathered the address and callback number — get them to a human fast. You never try to resolve a crisis yourself.
${
  client.service_area
    ? `\nService area: ${business} serves ${client.service_area}. If the caller is clearly outside that area, take their details anyway and tell them the office will call back to confirm whether they can help — never turn someone away flatly during an emergency.\n`
    : ""
}${client.agent_notes ? `\nSpecific to this company:\n${client.agent_notes}\n` : ""}
Stay in character as a calm, competent assistant the whole call. If the caller is upset, acknowledge it briefly and keep moving the call forward — don't over-apologize or stall.`;
}

/**
 * Build the Vapi assistant for a given client.
 *
 * Called per inbound call by the assistant-request route, so it must stay
 * cheap — pure string assembly, no I/O.
 */
export function buildAssistant(client: AgentClient = DEMO_CLIENT) {
  const business = client.greeting_name || client.name;
  const transferTo =
    client.emergency_transfer_number || site.ownerCellE164;

  return {
    name: "restoration-intake-v1",
    firstMessage: `Thanks for calling — you've reached ${business}'s automated assistant, and this call may be recorded. What's going on?`,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "system", content: buildSystemPrompt(client) }],
      tools: [
        {
          type: "transferCall",
          destinations: [
            {
              type: "number",
              number: transferTo,
              message: "Connecting you now — stay on the line.",
              description:
                "Use this the moment a live emergency is identified and the caller's address and callback number are captured. Do not delay the transfer to keep gathering non-essential details.",
            },
          ],
        },
      ],
    },
    // Premium voice — this is most of the perceived quality gap vs the
    // turnkey competitors (billed through Vapi at cost, no separate account).
    voice: {
      provider: "11labs",
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel — natural, professional
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
    },
    // Faster turn-taking: start responding sooner after the caller stops.
    startSpeakingPlan: {
      waitSeconds: 0.3,
    },
    // Keep latency down; premium voice tiers only if a client complains later.
    // NOTE: backgroundDenoising stays OFF — Vapi's Krisp path triggers a
    // mid-call media renegotiation that breaks audio over the Telnyx bridge.
    backgroundDenoisingEnabled: false,
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 480, // hard per-call ceiling — cap runaway cost/spend
    analysisPlan: {
      summaryPlan: {
        enabled: true,
      },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            emergency: { type: "boolean" },
            callerName: { type: "string" },
            callbackNumber: { type: "string" },
            serviceAddress: { type: "string" },
            standingWater: { type: "boolean" },
            category: {
              type: "string",
              enum: ["clean", "gray", "black", "unknown"],
            },
            lossDate: { type: "string" },
            insuranceCarrier: { type: "string" },
            arrivalWindow: { type: "string" },
            transferredToOwner: { type: "boolean" },
          },
        },
      },
    },
    server: {
      url: `${site.deployedUrl}/api/vapi/webhook`,
    },
  };
}

/**
 * The demo-line assistant, kept as a named export so
 * scripts/sync-vapi-assistant.ts keeps working unchanged.
 */
export const restorationAssistant = buildAssistant(DEMO_CLIENT);
