"use client";

import { useActionState } from "react";
import {
  setVoicemailNumber,
  setVoicemailNumberForClient,
  type VoicemailNumberState,
} from "@/app/actions/portal";

// One-click control on a call the client already received: send this number to
// voicemail next time instead of the intake agent.
//
// Wording matters here. "Block" or "never answer" would be wrong twice over —
// the call IS still answered, recorded, and emailed, and a contractor reading
// "block" reasonably worries he's about to lose a customer. All that changes
// is the greeting.
//
// `suggested` promotes the control when the agent decided mid-call that this
// wasn't a customer. It is only ever a prompt: nothing routes itself, because
// a false positive here silently sends a real job to voicemail and nobody
// finds out. One wasted friend-call costs seconds; one missed emergency costs
// the job and the client.

export default function VoicemailToggle({
  number,
  enabled,
  suggested = false,
  clientId,
}: {
  number: string;
  enabled: boolean;
  /** The agent classified this call as a non-customer. */
  suggested?: boolean;
  /**
   * Set only on the ops dashboard, where the operator is an admin acting on a
   * client's behalf. Omitted in the client portal, where the signed-in session
   * already identifies the client.
   */
  clientId?: string;
}) {
  const [state, formAction, pending] = useActionState<
    VoicemailNumberState,
    FormData
  >(clientId ? setVoicemailNumberForClient : setVoicemailNumber, undefined);

  const highlight = suggested && !enabled;

  return (
    <form
      action={formAction}
      className={
        highlight
          ? "mt-4 rounded-xl border border-caution-line bg-caution-surface p-3"
          : "mt-4"
      }
    >
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />

      {highlight && (
        <p className="mb-2 text-xs text-content-secondary">
          This didn&apos;t look like a customer. Want it to go straight to
          voicemail next time?
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-line-default px-3 py-1 text-xs text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : enabled
              ? "↩ Answer this number normally again"
              : "↪ Send this number to voicemail instead"}
        </button>
        <span className="text-xs text-content-tertiary">
          {enabled
            ? "Personal contact — gets a short message-taking greeting, not the intake questions."
            : "For personal contacts. They still get answered and you still get the message."}
        </span>
        {state?.error && (
          <span role="alert" className="text-xs text-critical-text">
            {state.error}
          </span>
        )}
      </div>
      {/* The button's own label flips on success, but a screen-reader user who
          just activated it hears nothing confirm the write landed. This does.
          `enabled` is the pre-submit value, so after a successful save it
          describes the state we just moved to. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state?.ok
          ? enabled
            ? "This number will be answered normally again."
            : "This number will now go straight to voicemail."
          : ""}
      </span>
    </form>
  );
}
