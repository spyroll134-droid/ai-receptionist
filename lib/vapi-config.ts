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

If the transfer does not go through: stay calm and stay with the caller. Reassure them the on-call person already has their address and callback number and will call them right back. Then finish any intake questions you have not asked yet, confirm their callback number one more time, and end the call politely. Never just go silent or hang up after a failed transfer.
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
              // Warm, not blind: the caller stays with the assistant while
              // Vapi dials the owner on a separate leg, and the bridge only
              // completes when a human actually speaks — the owner's cell
              // voicemail can't swallow an emergency the way a blind bridge
              // lets it. If the owner never picks up, fallbackPlan returns
              // the assistant to the caller instead of stranding them.
              transferPlan: {
                mode: "warm-transfer-wait-for-operator-to-speak-first-and-then-say-message",
                message:
                  "Emergency call from your answering line. The caller is on hold with their details captured. Connecting you now.",
                fallbackPlan: {
                  message:
                    "I wasn't able to reach the on-call person directly, but they've already been sent your address and callback number, and they'll call you right back.",
                  endCallEnabled: false,
                },
              },
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
    // The LLM is only invoked when the caller speaks, so the prompt's
    // "check in during silence" instruction can never fire on its own —
    // idleMessages are Vapi's platform-level nudge for exactly this.
    // ~8s per nudge × 3 nudges fits inside the 30s silence hangup below.
    messagePlan: {
      idleMessages: [
        "Sorry, are you still there?",
        "I'm still here — take your time.",
        "If you can hear me, just say anything and we'll keep going.",
      ],
      idleTimeoutSeconds: 8,
      idleMessageMaxSpokenCount: 3,
    },
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 480, // hard per-call ceiling — cap runaway cost/spend
    analysisPlan: {
      summaryPlan: {
        enabled: true,
      },
      structuredDataPlan: {
        enabled: true,
        // Descriptions matter: the extractor infers each field's meaning
        // from them, and omitting one means it guesses from the name alone.
        schema: {
          type: "object",
          properties: {
            emergency: {
              type: "boolean",
              description:
                "True if the caller described an active emergency (flooding in progress, burst pipe, water spreading now) or the assistant treated the call as one.",
            },
            callerName: {
              type: "string",
              description: "The caller's name as they gave it. Omit if never captured.",
            },
            callbackNumber: {
              type: "string",
              description:
                "The callback phone number the caller provided, digits only. Omit if never captured.",
            },
            serviceAddress: {
              type: "string",
              description:
                "The address of the property needing service. Omit if never captured.",
            },
            standingWater: {
              type: "boolean",
              description: "True if the caller said there is standing water on site.",
            },
            category: {
              type: "string",
              enum: ["clean", "gray", "black", "unknown"],
              description:
                "Water category if discussed: clean, gray, or black (sewage). Use unknown if it never came up or the caller wasn't sure.",
            },
            lossDate: {
              type: "string",
              description:
                "When the damage happened, in the caller's words (e.g. 'last night', 'two days ago'). Omit if never captured.",
            },
            insuranceCarrier: {
              type: "string",
              description:
                "The insurance carrier the caller is working with. Omit if none or never discussed.",
            },
            arrivalWindow: {
              type: "string",
              description:
                "The exact arrival window the assistant committed to on the call, e.g. 'within two to three hours'. Only set if the assistant actually stated a window; omit otherwise.",
            },
            transferredToOwner: {
              type: "boolean",
              description:
                "True if the assistant transferred the caller live to the on-call person.",
            },
          },
        },
      },
    },
    server: {
      url: `${site.deployedUrl}/api/vapi/webhook`,
      // Sent back by Vapi as x-vapi-secret; the webhook rejects without it
      // (lib/vapi-auth.ts). Undefined only in local builds without env.
      ...(process.env.VAPI_WEBHOOK_SECRET
        ? { secret: process.env.VAPI_WEBHOOK_SECRET }
        : {}),
    },
  };
}

/**
 * The demo-line assistant, kept as a named export so
 * scripts/sync-vapi-assistant.ts keeps working unchanged.
 */
export const restorationAssistant = buildAssistant(DEMO_CLIENT);
