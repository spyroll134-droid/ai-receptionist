import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// NOTE: this file is `proxy.ts`, NOT `middleware.ts`.
//
// Next.js 16 renamed the middleware convention to proxy. Nearly every
// Supabase-auth-with-Next tutorial online still says `middleware.ts` — on
// Next 16 that file is inert. It sits there looking correct while every
// protected route stays wide open. See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// Two jobs: refresh the auth cookie on every request so sessions don't expire
// mid-visit, and bounce signed-out users away from the portal.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Without Supabase configured there's no session to check. Fail open rather
  // than locking everyone out of a misconfigured deploy — the portal page
  // re-checks auth server-side regardless, so this isn't the security boundary.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (not getSession()) — this verifies the JWT with Supabase rather
  // than trusting whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Prefix matches, not equality: both surfaces have sub-pages now, and an
  // exact list is one new tab away from being silently unprotected.
  const isProtected =
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/");

  if (!user && isProtected) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }

  // Already signed in and landing on /login with nowhere in particular to be?
  // Send them to whichever home is theirs. Admins were previously dumped on
  // /portal, which is the client view — they had no path to /dashboard.
  //
  // The ?next= escape hatch matters: without it a signed-in user could never
  // reach the form to sign in as someone else, and a stale session looked
  // indistinguishable from a rejected password.
  if (user && pathname === "/login" && !request.nextUrl.searchParams.has("next")) {
    const { data: admin } = await supabase
      .from("admins")
      .select("auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const to = request.nextUrl.clone();
    to.pathname = admin ? "/dashboard" : "/portal";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return response;
}

export const config = {
  // Everything except static assets, images, and the API routes — the Vapi
  // webhook must never be redirected to a login page.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
