import type { NextConfig } from "next";

/**
 * The ONE origin this app is served on in production.
 *
 * Railway holds BOTH `supagloo.com` and `www.supagloo.com` as custom domains on the
 * nextjs service, and until this redirect existed neither 301'd to the other — both
 * answered 200. That is not merely untidy, because two things in this app are functions
 * of the origin the browser happened to arrive by:
 *
 *  1. The OAuth `redirect_uri`. `lib/api/app-url.ts` builds it from the `Host` header
 *     (deliberately — see that module for why `request.url` cannot do the job), so the
 *     URI handed to GitHub was whichever host the user typed. Every one of them must be
 *     registered on the GitHub App or the user gets GitHub's "The redirect_uri is not
 *     associated with this application" page instead of a consent screen.
 *
 *  2. The session cookie. `lib/api/cookies.ts` sets no `domain` attribute, so
 *     `supagloo_session` is HOST-ONLY: a session established on www is not sent to the
 *     apex, and vice versa.
 *
 * Those two combine into a failure that no amount of GitHub configuration can fix. The
 * install button (`app/api/connect/github/start/route.ts`) sends NO `redirect_uri` — it
 * opens the bare `/apps/{slug}/installations/new` — and GitHub's rule for that case is
 * "if you do not specify redirect_uri, the FIRST callback URL will be used". A GitHub App
 * has exactly one first callback URL. So whichever origin it names, a user who installed
 * from the OTHER origin is returned to a host their session cookie is not valid for: the
 * callback forwards a null token, the API 401s, they land on `/?github=error` signed out,
 * and the tab they started in polls for a connection that was never stored.
 *
 * Collapsing to one origin removes the variable rather than enumerating its values. Every
 * user is on the canonical host before any flow starts, so every `redirect_uri` agrees
 * with the App's first callback URL and every session cookie is valid where it lands.
 *
 * It is also self-healing for the case it cannot prevent: if an authorization `code` ever
 * DOES arrive at the apex, this redirect carries it to the canonical host with the query
 * string intact (Next forwards params the destination does not consume), so the callback
 * runs where the cookie is.
 *
 * Naturally inert outside production — the match is an exact host, so `localhost:3000`,
 * `localhost:8000` and any preview host never see it.
 */
const CANONICAL_HOST = "www.supagloo.com";

/** Hosts that serve the app but are not {@link CANONICAL_HOST}. Adding a domain in
 *  Railway without adding it here re-opens the split described above. */
const NON_CANONICAL_HOSTS = ["supagloo.com"] as const;

const nextConfig: NextConfig = {
  async redirects() {
    return NON_CANONICAL_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: `https://${CANONICAL_HOST}/:path*`,
      // Permanent (308). This is a canonicalization we intend to keep, and 308 is the
      // answer that preserves the method and tells crawlers which origin is real. The
      // cost is that browsers cache it, so serving the apex independently again would
      // need a cache-busting change rather than just deleting this rule.
      permanent: true,
    }));
  },
};

export { CANONICAL_HOST, NON_CANONICAL_HOSTS };
export default nextConfig;
