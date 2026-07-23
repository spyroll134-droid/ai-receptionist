import { redirect } from "next/navigation";

// The Outcomes tab moved to /portal/bookings in the dashboard redesign — booked
// jobs and the won / didn't-book ledger now live together there. Kept as a
// permanent redirect so any bookmark or old link a client saved still lands on
// the right page instead of a 404.
export default function PortalOutcomes() {
  redirect("/portal/bookings");
}
