import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { site } from "@/lib/site-config";

export const metadata = {
  title: `Privacy Policy — ${site.businessName}`,
};

export default function PrivacyPolicy() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-24 text-slate-700 leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Last updated July 20, 2026
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Information we collect
            </h2>
            <p className="mt-2">
              When you request a trial, we collect the information you submit:
              company name, your name, phone number, email (if provided), and
              your trade. When our AI receptionist handles a call on your
              behalf, we collect information about that call: the caller&apos;s
              name and callback number, service address, and other details
              relevant to your trade (for example, insurance carrier or loss
              date for restoration calls). Calls may be recorded and
              transcribed; our AI discloses to callers, up front, that the
              call may be recorded.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              How we use your information
            </h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>To set up, operate, and support your trial and service.</li>
              <li>
                To contact you by phone, text message, or email about your
                trial, your account, or a call our AI receptionist handled
                for you.
              </li>
              <li>To improve the accuracy and reliability of the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Text messages
            </h2>
            <p className="mt-2">
              By submitting the trial form, you agree to receive calls and
              text messages from us related to your trial setup and ongoing
              service. Message and data rates may apply. You can opt out of
              text messages at any time by replying STOP.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Third-party service providers
            </h2>
            <p className="mt-2">
              We use trusted third parties to run the service: Vapi (the
              voice AI platform that answers calls), Supabase (database
              storage for call and account records), Resend (email
              notifications), and Vercel (hosting). These providers process
              data on our behalf and are not permitted to use it for their
              own purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Data retention
            </h2>
            <p className="mt-2">
              We keep call recordings, transcripts, and account records for
              as long as your account is active, and for a reasonable period
              afterward for support and legal purposes. You can request
              deletion of your data by contacting us below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Your choices
            </h2>
            <p className="mt-2">
              You can ask us to access, correct, or delete your information,
              or opt out of text messages or emails, at any time by
              contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Changes to this policy
            </h2>
            <p className="mt-2">
              We may update this policy from time to time. We&apos;ll update
              the date above when we do.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Contact us
            </h2>
            <p className="mt-2">
              Questions about this policy? Reach us at{" "}
              <a
                href={`mailto:${site.contactEmail}`}
                className="underline hover:text-slate-900"
              >
                {site.contactEmail}
              </a>{" "}
              or{" "}
              <a
                href={site.contactPhoneHref}
                className="underline hover:text-slate-900"
              >
                {site.contactPhoneDisplay}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
