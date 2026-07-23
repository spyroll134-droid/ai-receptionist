import Link from "next/link";

// Shared primitives for the marketing site and the portal. Every surface in
// the product composes from these — if a component needs a one-off color or
// spacing value, add a token in globals.css and a variant here rather than
// dropping a hex literal inline. That discipline is what makes the two
// surfaces read as one company.

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Accent is reserved for the single most important action on a view.
  primary:
    "bg-accent-button text-accent-contrast hover:bg-accent-button-hover active:bg-accent-button-press",
  secondary:
    "border border-line-strong text-content-primary hover:bg-surface-overlay hover:border-line-strong",
  ghost: "text-content-secondary hover:text-content-primary hover:bg-surface-raised",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

function buttonClass(variant: ButtonVariant, size: ButtonSize, className = "") {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const cls = buttonClass(variant, size, className);
  // Internal routes go through next/link for client-side nav; tel: and mailto:
  // must stay plain anchors or the router intercepts them.
  const isInternal = href.startsWith("/") || href.startsWith("#");
  if (isInternal) {
    return (
      <Link href={href} className={cls} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...props}>
      {children}
    </a>
  );
}

export function Card({
  className = "",
  children,
  emphasis = false,
}: {
  className?: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-surface-raised shadow-card ${
        emphasis ? "border-accent-line" : "border-line-default"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Consistent vertical rhythm for every landing-page band. `band` tints the
// section one step up from the page so long pages have visual structure
// without needing dividers everywhere.
export function Section({
  id,
  band = false,
  width = "wide",
  className = "",
  children,
}: {
  id?: string;
  band?: boolean;
  width?: "narrow" | "medium" | "wide";
  className?: string;
  children: React.ReactNode;
}) {
  const widths = {
    narrow: "max-w-3xl",
    medium: "max-w-4xl",
    wide: "max-w-6xl",
  };
  return (
    <section
      id={id}
      className={band ? "border-y border-line-subtle bg-surface-raised/40" : ""}
    >
      <div className={`mx-auto ${widths[width]} px-6 py-20 sm:py-28 ${className}`}>
        {children}
      </div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-semibold uppercase text-accent-text">{children}</p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: "left" | "center";
}) {
  const alignment = align === "center" ? "text-center mx-auto" : "";
  return (
    <div className={alignment}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        className={`text-3xl font-semibold text-content-primary text-balance ${
          eyebrow ? "mt-3" : ""
        }`}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={`mt-4 max-w-2xl text-base text-content-secondary text-balance ${
            align === "center" ? "mx-auto" : ""
          }`}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-5 w-5 flex-none ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line-default bg-surface-overlay px-3 py-1 text-xs font-medium text-content-secondary">
      {children}
    </span>
  );
}

// Form field with a real <label>, wired to the input via id. Used by the
// trial form and the auth pages so inputs look and behave identically.
export function Field({
  label,
  name,
  hint,
  className = "",
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-content-secondary"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        className="mt-1.5 h-11 w-full rounded-lg border border-line-default bg-surface-inset px-3 text-sm text-content-primary placeholder:text-content-faint focus:border-accent focus:outline-none"
        {...props}
      />
      {hint && <p className="mt-1.5 text-xs text-content-tertiary">{hint}</p>}
    </div>
  );
}
