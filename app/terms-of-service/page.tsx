import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { site } from "@/lib/site-config";

export const metadata = {
  title: `Terms of Service — ${site.businessName}`,
};

export default function TermsOfService() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-24 text-slate-700 leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Last updated July 20, 2026
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              The service
            </h2>
            <p className="mt-2">
              {site.businessName} provides an AI receptionist that answers
              phone calls your team doesn&apos;t pick up — after-hours,
              during overflow, or when your lines are full — qualifies the
              caller, and books an appointment or hands the call to you
              directly for emergencies. Your published phone number never
              changes; calls only reach us when your team doesn&apos;t answer.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Trial and billing
            </h2>
            <p className="mt-2">
              New customers get a {site.pricing.trialDays}-day free trial on
              their real phone line, no card required. After the trial,
              service is ${site.pricing.monthly}/month plus a one-time $
              {site.pricing.setup} setup fee, billed month-to-month. There is
              no contract — cancel at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Your responsibilities
            </h2>
            <p className="mt-2">
              You&apos;re responsible for giving us accurate information
              about your business so the AI can represent it correctly, and
              for complying with any laws that apply to how your business
              communicates with its customers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              AI limitations and emergencies
            </h2>
            <p className="mt-2">
              The AI receptionist is an automated system. While it&apos;s
              built to recognize urgent situations and transfer them to you
              live, it can make mistakes and is not a substitute for
              emergency services. Callers facing a life-threatening
              emergency should always be directed to call 911.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Call recording
            </h2>
            <p className="mt-2">
              Calls handled by the AI receptionist may be recorded and
              transcribed to provide the service and for quality review. The
              AI discloses this to callers at the start of the call.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Cancellation
            </h2>
            <p className="mt-2">
              You can cancel at any time by contacting us. Once cancelled,
              calls will stop being forwarded to the AI receptionist and
              will ring through as they did before you signed up.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Disclaimer and limitation of liability
            </h2>
            <p className="mt-2">
              The service is provided &quot;as is.&quot; We work to keep it
              accurate and reliable, but we don&apos;t guarantee it will be
              error-free or uninterrupted. To the extent permitted by law,
              our liability for any claim related to the service is limited
              to the amount you paid us in the month the claim arose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Governing law
            </h2>
            <p className="mt-2">
              These terms are governed by the laws of the State of Michigan,
              without regard to conflict-of-law principles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              Contact us
            </h2>
            <p className="mt-2">
              Questions about these terms? Reach us at{" "}
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
