import type { NavItem } from "@/components/ops";

// The client portal's tabs. Kept in its own module so every portal page imports
// the same list — a nav that disagrees with itself between tabs is the classic
// way an "active" underline ends up on the wrong item.
//
// Five tabs, zero sub-tabs (the Jobber/Housecall-Pro bar). Each maps to a real
// deliverable (SCOPE.md): Dashboard = "is this paying for itself?", Calls = the
// full record + recordings/transcripts, Leads = the work queue (follow-up +
// close-out), Bookings = booked jobs + won/didn't-book ledger. No "Reports" tab
// — there is no reporting deliverable to put behind it.
export const PORTAL_NAV: NavItem[] = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/calls", label: "Calls" },
  { href: "/portal/leads", label: "Leads" },
  { href: "/portal/bookings", label: "Bookings" },
  { href: "/portal/settings", label: "Settings" },
];
