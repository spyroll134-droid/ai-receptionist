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
import { owner } from "./owner-config";

/** The subset of a `clients` row the agent needs. */
export type AgentClient = {
  name: string;
  greeting_name?: string | null;
  trade?: string | null;
  service_area?: string | null;
  emergency_transfer_number?: string | null;
  agent_notes?: string | null;
};

/**
 * Fallback used for the demo line and for any unrecognized number. Trade is
 * left null on purpose: the demo is the UNIVERSAL template a cold-call prospect
 * of any trade hears, so it resolves to the trade-neutral profile in
 * tradeProfile() ("a home services company") rather than claiming to be a
 * restoration shop. Onboarding a real client sets their trade (and agent_notes),
 * which turns this universal template into their personalized copy.
 */
export const DEMO_CLIENT: AgentClient = {
  name: site.businessName,
  greeting_name: site.businessName,
  trade: null,
  emergency_transfer_number: owner.cellE164,
};

/**
 * Trade-specific pieces of the intake script.
 *
 * The bones of the call are identical across trades — disclose, triage
 * emergency vs not, get name/number/address, hand off a live emergency. What
 * changes is the vocabulary: a plumber's caller doesn't have a "water
 * category", a roofer's emergency is a torn-off roof in a storm, not a burst
 * pipe. Matching that language is the difference between sounding like the
 * company's own line and sounding like a generic robot reading a restoration
 * script at a roofing customer.
 *
 * Matched by substring so onboarding is forgiving — "Roofing", "roofer",
 * "Residential Roofing" all resolve. Anything unrecognized falls through to a
 * trade-neutral profile rather than guessing wrong.
 */
type TradeProfile = {
  /** How the assistant describes the business in its own words. */
  noun: string;
  /** Example emergencies for the first triage question. */
  emergencyExamples: string;
  /** The trade-specific detail question, asked after name/number/address. */
  detailQuestion: string;
};

function tradeProfile(trade?: string | null): TradeProfile {
  const t = (trade ?? "").toLowerCase();

  if (t.includes("roof")) {
    return {
      noun: "a roofing company",
      emergencyExamples:
        "water pouring in during a storm, a section of roof torn off or missing, or an active leak coming through the ceiling right now",
      detailQuestion:
        "Whether water is actively coming into the home, and if they know, whether it looks like storm, wind, or hail damage.",
    };
  }

  if (t.includes("plumb")) {
    return {
      noun: "a plumbing company",
      emergencyExamples:
        "a burst pipe, water flooding a room, sewage backing up, or a leak they can't shut off",
      detailQuestion:
        "Whether they've been able to shut the water off, and whether it's an active leak, a drain backing up, or sewage.",
    };
  }

  if (
    t.includes("restor") ||
    t.includes("water") ||
    t.includes("flood") ||
    t.includes("mold") ||
    t.includes("mitigat")
  ) {
    return {
      noun: "a water damage restoration company",
      emergencyExamples:
        "active flooding, a burst pipe, or water actively spreading through the home",
      detailQuestion:
        "Is there standing water, and roughly what category — clean water, gray water, or sewage — if they know.",
    };
  }

  // Trade-neutral fallback. This is what the DEMO line uses (see DEMO_CLIENT),
  // so cold-call prospects across every trade hear it — it names no single
  // trade, so it never sounds wrong to a roofer or a plumber. The emergency
  // examples span the trades we sell into, and the prompt's ambiguity rule
  // catches anything not listed. Onboarding a real client sets their `trade`
  // (and agent_notes), which swaps this for trade-matched language — the demo
  // is the universal template, each client is a personalized copy of it.
  return {
    noun: "a home services company",
    emergencyExamples:
      "water flooding in, a roof torn open or leaking, or any damage that's getting worse right now",
    detailQuestion:
      "What's happening at the property right now, and whether it's still active and getting worse or has already stopped.",
  };
}

function buildSystemPrompt(client: AgentClient) {
  const business = client.greeting_name || client.name;
  const trade = tradeProfile(client.trade);

  return `You are the automated answering assistant for ${business}, ${trade.noun}. You answer calls the company's own team didn't pick up — after-hours, during a storm surge, or when lines are full. You are not replacing their receptionist; you are catching what they missed.

Disclosure: your very first sentence must tell the caller they've reached an automated assistant and that the call may be recorded. Never skip this, never bury it.

Speaking style, strictly enforced:
- Short sentences. One idea per sentence.
- Never read out a list. Ask one question, wait for the answer, ask the next.
- Say numbers the way a person would say them out loud ("twenty-three hundred dollars", not "$2,300"; "two to three hours", not "2-3 hrs").
- Never say a URL or spell out an email address.
- If the caller goes quiet for a few seconds, check in ("Sorry, are you still there?") instead of waiting silently.
- Treat "yes", "okay", "no", and other short replies as real answers to your gate questions, not filler to ignore.
- Always speak TO the caller. Never narrate about them in the third person, and never think out loud — if you are unsure what to do next, ask them a question instead.
- If you were cut off partway through a question, ask that question again from the start. A half-asked question is an unanswered question, and the caller cannot answer what they never heard.
- Never ask for something the caller has already given you. Before every question, check whether you already have that answer.
- If you cannot make out what they said, say so plainly and confirm what you already have rather than asking again from scratch. Trouble hearing someone is a bad line, not a new caller.

What you're finding out, in order, one question at a time:
1. Is this an emergency right now (${trade.emergencyExamples}) or something that already happened / can wait?
2. Their name and a callback number. If they say to use the number they're calling from — "this number", "the one I'm calling from", "my cell" — that is a complete answer, not a dodge. Read the number you have back to them to confirm, thank them, and move on. Never press someone for digits they have already effectively given you.
3. The service address.
4. ${trade.detailQuestion}
5. When it happened (today, last night, a few days ago, etc).
6. Do they have an insurance carrier they're working with, if any.

Not everyone is calling about a job. Some callers have the wrong number, are a supplier or a subcontractor, are someone who knows the owner personally, or simply want to leave a message. The moment it is clear this is not someone needing service, stop the intake questions — do not ask a supplier the detail question. Instead take a message: get their name, the best number to reach them, and what they want the owner to know. Read the message back to confirm you got it right, tell them you'll pass it along, and end the call politely. Taking a good message is a complete, successful call; never force someone through the service questions to get there.

This switch is about WHO is calling, never about how well you can hear them. Someone who has already described a problem with their property is a customer, however garbled the line gets. Do not fall back to taking a message because the audio went bad — stay with the intake, and re-confirm what you already have.

Ambiguity rule: if you are not sure whether something is an emergency, treat it as one. A real emergency is worth far more than one wasted precaution — never talk yourself out of treating a caller seriously.

Booking: never ask a caller to pick a date. For an emergency, commit to an arrival window — "someone can be out within two to three hours" — and confirm the address and callback number are correct. For a non-emergency, tell them the office will follow up shortly to schedule, and confirm their callback number.

Emergency hand-off: if this is a real emergency, tell the caller you're connecting them to the on-call person right now, and use the transferCall tool immediately. Do not keep asking questions once you've identified a live emergency and gathered the address and callback number — get them to a human fast. You never try to resolve a crisis yourself.

If the transfer does not go through: stay calm and stay with the caller. Reassure them the on-call person already has their address and callback number and will call them right back. Then finish any intake questions you have not asked yet, confirm their callback number one more time, and end the call politely. Never just go silent or hang up after a failed transfer.

Never end the call without a callback number. This is the one thing the company cannot work around — a name and an address are useless if nobody can ring them back. If you do not have one, do not hang up: tell them you'll use the number they're calling from, read it back, and let them correct it. Only if they refuse outright do you close without one.

Ending the call: once you've captured what you need and confirmed the callback number, close simply — let the caller know someone will be in touch with them soon, thank them, and then END THE CALL using the endCall tool. Do NOT keep the line open after saying goodbye, and do NOT ask whether they need anything further or offer more guidance — your job is to catch the call and pass it on, not to advise. A warm one-line goodbye followed by hanging up is exactly right.
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
    client.emergency_transfer_number || owner.cellE164;

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
        // Lets the assistant actually hang up. Without this the model can say
        // goodbye but the line stays open until the 30s silence timeout — the
        // caller sits listening to dead air after being told the call is done.
        // The prompt's "Ending the call" section is what drives it; this is the
        // lever that instruction pulls.
        { type: "endCall" },
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
    // How easily the caller can cut the assistant off mid-sentence.
    //
    // This was previously unset, and Vapi's defaults (numWords 0, voiceSeconds
    // 0.2) mean ANY two tenths of a second of detected audio kills the current
    // sentence — a cough, a door, a TV, someone saying "uh huh" to agree with
    // you. Verified 2026-07-22 against docs.vapi.ai/customization/speech-configuration.
    //
    // Call 019f8bb1 is what that costs: the assistant was cut off at "What is
    // the address where the serve" by background mumbling, never re-asked, and
    // the job was saved with no service address. Note that waitSeconds above is
    // 0.3 against a 0.4 default, so this agent was tuned aggressive on BOTH
    // ends of the turn — quick to start, trivial to interrupt.
    //
    // Three real words is the trade-off: a caller who genuinely wants to break
    // in ("no, wait, it's flooding") still gets through in well under a second,
    // while a noise or a backchannel does not. backoffSeconds is raised so the
    // assistant doesn't immediately talk over the caller when it resumes.
    stopSpeakingPlan: {
      numWords: 3,
      voiceSeconds: 0.3,
      backoffSeconds: 1.5,
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
                "True if the caller described an active property emergency happening right now — the kind where waiting makes it worse. This spans every trade, not just water: flooding or a burst pipe, a roof torn off or storm-damaged with water coming in, an active ceiling leak, a drain or sewage backing up, a line the caller can't shut off, or any damage getting worse by the minute. It is ALSO true whenever the assistant connected or attempted to connect the caller to the on-call person, since it only does that for a live emergency. False only for something that already happened and can clearly wait. When unsure, prefer true.",
            },
            callerName: {
              type: "string",
              description: "The caller's name as they gave it. Omit if never captured.",
            },
            callbackNumber: {
              type: "string",
              description:
                "The callback phone number for this caller, digits only. If the caller said to use the number they are calling from — 'this number', 'the one I'm calling from', 'my cell' — set this to the number the call came in on. Omit only if no number was ever established.",
            },
            serviceAddress: {
              type: "string",
              description:
                "The address of the property needing service. Omit if never captured.",
            },
            standingWater: {
              type: "boolean",
              description:
                "True if the caller said there is standing water on site, false if they said there is none. Omit entirely if standing water never came up — do NOT default to false for a call where it was never discussed, because the portal renders a false as an established 'no'.",
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
            messageForOwner: {
              type: "string",
              description:
                "Set ONLY when the caller was not requesting service — a wrong number, a supplier, or someone leaving a personal message. The message they wanted passed along, in their own words. Omit entirely for anyone calling about a job.",
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
 * Voicemail mode: for numbers the client has routed here from the portal.
 *
 * Clients run their business off a personal cell, so the same line takes their
 * doctor's office, their kid's school, and their wife. Those callers must not
 * get a restoration intake — but they must not be BLOCKED either. The call is
 * still answered, still recorded, still emailed; only the greeting changes.
 * Whoever is calling gets what they actually wanted: somewhere to leave a
 * message, faster than carrier voicemail and transcribed on arrival.
 *
 * Deliberately has no transferCall tool. A number the owner marked personal is
 * the last thing that should ring their cell at 2am as an "emergency".
 */
export function buildVoicemailAssistant(client: AgentClient = DEMO_CLIENT) {
  const business = client.greeting_name || client.name;

  return {
    name: "voicemail-v1",
    firstMessage: `Hi — you've reached ${business}. Nobody's available to take the call, and this is an automated line that may be recorded. Leave your name and a number and I'll pass your message along.`,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a simple voicemail line for ${business}. Your only job is to take a message.

Your first sentence must say the call is automated and may be recorded. Never skip this.

Get three things, one question at a time: who is calling, the best number to reach them, and what they want to pass along. If they've already said any of it, don't ask again.

Read the message back briefly to confirm you have it right, tell them it'll be passed along and someone will be in touch soon, and then END THE CALL using the endCall tool. Do not keep the line open after saying goodbye, and do not ask if they need anything else.

Speaking style: short sentences, one idea each. Never read out a list. Say numbers the way a person says them out loud. Never say a URL or spell out an email address.

Do NOT ask about emergencies, water damage, insurance, addresses, or scheduling. This caller is not a customer — asking them intake questions is wrong and will annoy someone the owner knows personally. If they insist they need service urgently, take the message and tell them someone will call them right back.`,
        },
      ],
      tools: [{ type: "endCall" }],
    },
    voice: {
      provider: "11labs",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
    },
    transcriber: { provider: "deepgram", model: "nova-3" },
    startSpeakingPlan: { waitSeconds: 0.3 },
    // Same reasoning as the intake assistant above. Arguably matters more here:
    // this caller is mid-sentence leaving a message, and being cut off by their
    // own background noise is how a message ends up half-recorded.
    stopSpeakingPlan: { numWords: 3, voiceSeconds: 0.3, backoffSeconds: 1.5 },
    backgroundDenoisingEnabled: false,
    messagePlan: {
      idleMessages: ["Sorry, are you still there?", "I'm still here — go ahead."],
      idleTimeoutSeconds: 8,
      idleMessageMaxSpokenCount: 2,
    },
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 180,
    analysisPlan: {
      summaryPlan: { enabled: true },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            callerName: {
              type: "string",
              description: "The caller's name as they gave it. Omit if never captured.",
            },
            callbackNumber: {
              type: "string",
              description:
                "The callback number they gave, digits only. Omit if never captured.",
            },
            messageForOwner: {
              type: "string",
              description:
                "The message they wanted passed along, in their own words. This is the point of the call — always set it if they said anything at all.",
            },
          },
        },
      },
    },
    server: {
      url: `${site.deployedUrl}/api/vapi/webhook`,
      ...(process.env.VAPI_WEBHOOK_SECRET
        ? { secret: process.env.VAPI_WEBHOOK_SECRET }
        : {}),
    },
  };
}

/** Last 10 digits, so +1 (248) 402-3630 and 2484023630 compare equal. */
export function normalizePhone(raw?: string | null): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/**
 * The demo-line assistant, kept as a named export so
 * scripts/sync-vapi-assistant.ts keeps working unchanged.
 */
export const restorationAssistant = buildAssistant(DEMO_CLIENT);
