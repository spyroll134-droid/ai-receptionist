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

  if (!user && pathname === "/portal") {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }

  // Already signed in? Skip the login form.
  if (user && pathname === "/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/portal";
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
