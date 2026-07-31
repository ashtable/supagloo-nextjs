import { describe, it, expect } from "vitest";
import nextConfig, {
  CANONICAL_HOST,
  NON_CANONICAL_HOSTS,
} from "../../next.config";

/**
 * The apex→www canonicalization in `next.config.ts`.
 *
 * HONEST LIMIT, up front: Next owns the matching. These tests read the rule this repo
 * HANDS to Next; they cannot prove Next matches a `Host: supagloo.com` request with it,
 * because that is path-to-regexp's behaviour and not ours. That half was verified
 * behaviourally against a running `next dev` — a request with `Host: supagloo.com` got a
 * 308 to the canonical host and one with `Host: www.supagloo.com` did not redirect.
 *
 * What IS worth pinning here is the invariant that makes the rule safe rather than
 * catastrophic: the canonical host must never appear in the redirect-FROM list. Every
 * request to it would then match a rule pointing at itself, and the whole site would
 * become an infinite redirect loop — in every browser at once, cached, because these are
 * 308s. That is a one-word edit away (adding a domain to `NON_CANONICAL_HOSTS` is the
 * documented way to extend this), so it is exactly the kind of mistake a test should own.
 */
describe("canonical host redirect", () => {
  async function rules() {
    const redirects = nextConfig.redirects;
    if (!redirects) throw new Error("next.config.ts defines no redirects()");
    return await redirects();
  }

  it("never redirects the canonical host to itself", () => {
    // The loop guard. See the docblock: this is the assertion with teeth.
    expect(NON_CANONICAL_HOSTS).not.toContain(CANONICAL_HOST);
  });

  it("sends every non-canonical host to the canonical one", async () => {
    const found = await rules();
    expect(found).toHaveLength(NON_CANONICAL_HOSTS.length);

    for (const host of NON_CANONICAL_HOSTS) {
      const rule = found.find((r) =>
        r.has?.some((c) => c.type === "host" && c.value === host),
      );
      expect(rule, `no redirect rule for ${host}`).toBeDefined();
      expect(rule!.destination).toBe(`https://${CANONICAL_HOST}/:path*`);
    }
  });

  it("carries the whole path, so a callback URL is not flattened to the root", async () => {
    // `/api/connect/github/callback?code=…` must arrive intact. A rule that redirected
    // to the bare origin would drop an in-flight authorization code on the floor — the
    // rescue property this redirect is partly there to provide.
    for (const rule of await rules()) {
      expect(rule.source).toBe("/:path*");
      expect(rule.destination).toContain("/:path*");
    }
  });

  it("uses an absolute destination", async () => {
    // A relative destination would resolve against the REQUESTING origin — the apex —
    // and match its own rule again. Same loop as above, reached a different way.
    for (const rule of await rules()) {
      expect(rule.destination.startsWith("https://")).toBe(true);
    }
  });
});
