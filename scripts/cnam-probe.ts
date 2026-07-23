/**
 * Check what CNAM actually returns for numbers you recognize.
 *
 *   set -a && . ./.env.local && set +a
 *   npx tsx scripts/cnam-probe.ts 2484023630 3135551234 ...
 *
 * Run this BEFORE trusting caller-name data anywhere it matters. US mobile
 * CNAM coverage is poor and the records go stale, so the only way to know
 * whether it's worth anything for your callers is to look at your callers.
 *
 * Expect landlines and business PBXs to come back with real names, and a good
 * share of cells to come back empty or as filler ("WIRELESS CALLER", which
 * lib/cnam.ts filters to null). If most of your test numbers are blank, treat
 * CNAM as a bonus on business callers — not something to sell.
 *
 * Prints the RAW carrier response alongside the filtered value, so you can see
 * what was thrown away and judge the filter for yourself.
 */

import { lookupCnam } from "../lib/cnam";

const numbers = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (numbers.length === 0) {
  console.error(
    "Usage: npx tsx scripts/cnam-probe.ts <number> [number ...]\n" +
      "Any format works — 2484023630, (248) 402-3630, +12484023630."
  );
  process.exit(1);
}

if (!process.env.TELNYX_API_KEY) {
  console.error(
    "TELNYX_API_KEY not set. Add it to .env.local, then:\n" +
      "  set -a && . ./.env.local && set +a && npx tsx scripts/cnam-probe.ts ..."
  );
  process.exit(1);
}

// The filtered path (what the product would store) next to the unfiltered
// carrier response, so a blank result is distinguishable from a filtered one.
async function raw(ten: string) {
  try {
    const res = await fetch(
      `https://api.telnyx.com/v2/number_lookup/+1${ten}?type=caller-name`,
      {
        headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return `HTTP ${res.status}`;
    const j = (await res.json()) as {
      data?: {
        caller_name?: { caller_name?: string; error_code?: string };
        carrier?: { type?: string; name?: string };
      };
    };
    const cn = j.data?.caller_name;
    return (
      cn?.caller_name?.trim() ||
      (cn?.error_code ? `(error ${cn.error_code})` : "(empty)")
    );
  } catch (err) {
    return `(${String(err)})`;
  }
}

async function main() {
  let named = 0;

  for (const input of numbers) {
    const ten = input.replace(/\D/g, "").slice(-10);
    if (ten.length !== 10) {
      console.log(`${input.padEnd(18)} — not a 10-digit US number, skipped`);
      continue;
    }

    const [{ name, lineType }, rawName] = await Promise.all([
      lookupCnam(ten),
      raw(ten),
    ]);
    if (name) named++;

    console.log(
      `+1${ten}  ${(lineType ?? "?").padEnd(9)}  ` +
        `stored: ${(name ?? "—").padEnd(24)}  carrier said: ${rawName}`
    );
  }

  console.log(
    `\n${named}/${numbers.length} returned a non-empty name.\n` +
      "\nRead these yourself — a returned name is NOT a correct name. Measured\n" +
      "on 2026-07-22 this returned a previous owner's name for a live mobile\n" +
      "('BROWN,JOE' for a number in daily use) and a rate-center city for a\n" +
      "landline ('CUSHING      OK'). Both look like data and neither is. Only\n" +
      "trust this if names come back correct for numbers you personally know."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
