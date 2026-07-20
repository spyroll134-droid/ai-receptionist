import Link from "next/link";
import { site } from "@/lib/site-config";

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <span className="font-semibold text-slate-900 tracking-tight">
          {site.businessName}
        </span>
        <nav className="hidden sm:flex items-center gap-8 text-sm text-slate-600">
          <Link href="#how-it-works" className="hover:text-slate-900">
            How it works
          </Link>
          <Link href="#pricing" className="hover:text-slate-900">
            Pricing
          </Link>
          <Link href="#faq" className="hover:text-slate-900">
            FAQ
          </Link>
        </nav>
        <a
          href={site.demoPhoneHref}
          className="inline-flex flex-none items-center whitespace-nowrap rounded-full bg-slate-900 px-3 sm:px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          <span className="sm:hidden">Call now</span>
          <span className="hidden sm:inline">Call the demo line</span>
        </a>
      </div>
    </header>
  );
}
