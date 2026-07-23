// Creates or updates the restoration assistant on Vapi from
// lib/vapi-config.ts, so the config lives in git instead of being
// hand-edited in a dashboard.
//
// Usage: VAPI_API_KEY=... npm run sync-vapi
//
// The --conditions=react-server flag in that npm script is load-bearing, not
// decoration. vapi-config imports lib/owner-config, which is marked
// `server-only` so a client component can't leak the owner's cell into the
// browser bundle. The server-only package throws on import unless the
// react-server export condition is set — Next sets it automatically, plain
// tsx does not. Running `npx tsx scripts/sync-vapi-assistant.ts` bare fails
// with "This module cannot be imported from a Client Component module."
// That is the guard working, not a broken script.
//
// Prints the assistant id and phone number id — save those into
// .env.local / your notes, they're needed for the next steps.

import { restorationAssistant } from "../lib/vapi-config";

const API_KEY = process.env.VAPI_API_KEY;
if (!API_KEY) {
  console.error("Set VAPI_API_KEY in your environment first.");
  process.exit(1);
}

const BASE = "https://api.vapi.ai";
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function findExisting(name: string) {
  const res = await fetch(`${BASE}/assistant`, { headers });
  if (!res.ok) throw new Error(`List assistants failed: ${res.status} ${await res.text()}`);
  const all = (await res.json()) as Array<{ id: string; name?: string }>;
  return all.find((a) => a.name === name);
}

async function main() {
  const existing = await findExisting(restorationAssistant.name);

  const res = await fetch(
    existing ? `${BASE}/assistant/${existing.id}` : `${BASE}/assistant`,
    {
      method: existing ? "PATCH" : "POST",
      headers,
      body: JSON.stringify(restorationAssistant),
    }
  );

  if (!res.ok) {
    console.error(`Vapi API error: ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }

  const result = (await res.json()) as { id: string };
  console.log(existing ? "Updated" : "Created", "assistant:", result.id);
  console.log("\nNext: buy/import a phone number in the Vapi dashboard and");
  console.log("attach it to assistant id:", result.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
