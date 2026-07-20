import { site } from "@/lib/site-config";

export default function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-6 py-12 text-sm text-slate-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 pt-8">
        <span>
          © {new Date().getFullYear()} {site.businessName}
        </span>
        <div className="flex items-center gap-6">
          <a href={`mailto:${site.contactEmail}`} className="hover:text-slate-800">
            {site.contactEmail}
          </a>
          <a href={site.contactPhoneHref} className="hover:text-slate-800">
            {site.contactPhoneDisplay}
          </a>
        </div>
      </div>
    </footer>
  );
}
