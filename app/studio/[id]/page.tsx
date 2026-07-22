import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import StudioApp from "../_components/studio-app";
import StudioLoader from "../_components/studio-loader";
import { findStudioProject } from "@/lib/studio/project";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { WS_TOKENS } from "../ws-tokens";
import styles from "../studio.module.css";

/**
 * Turn 13b / Task #27 — the `/studio/[slug]` "Wilderness Studio" editor.
 *
 * Mock/real branching (D-1): in demo builds (`NEXT_PUBLIC_SUPAGLOO_DEMO=1` — on for
 * dev/e2e, ABSENT in prod, matching `parseMockSession`'s prod-safety rule) a known
 * catalog id resolves to the bundled `DEMO_STORYBOARD` synchronously (zero network),
 * exactly as before — so every existing studio spec (which `goto`s a bare catalog id)
 * stays green. Every OTHER id defers to the client `StudioLoader`, which hydrates the
 * reducer from the REAL API (`GET /v1/projects/:id` + manifest → Zod-parsed
 * `ProjectManifest`).
 *
 * A catalog miss WITHOUT a session cookie can't be a real project (a signed-out
 * visitor owns none) → an instant themed `notFound()` — this keeps the routing spec's
 * unknown-id assertion instant instead of racing the client fetch. `params` is a
 * Promise in Next 16.
 */
const DEMO = process.env.NEXT_PUBLIC_SUPAGLOO_DEMO === "1";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const mock = DEMO ? findStudioProject(id) : null;
  const description =
    "Edit your scripture-video storyboard — scenes, captions, narrator voice, music & timing — on your project's working version branch.";
  if (mock) return { title: `${mock.projectName} — Studio`, description };
  return { title: "Studio", description };
}

export default async function StudioProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Mock catalog (demo builds only) → the synchronous zero-network path, unchanged.
  const mock = DEMO ? findStudioProject(id) : null;
  if (mock) {
    return (
      <div className={styles.backdrop} style={WS_TOKENS}>
        <StudioApp project={mock} />
      </div>
    );
  }

  // No session → no real project to resolve → the themed 404 (instant, like the old
  // synchronous catalog miss).
  const authed = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!authed) notFound();

  // Real path: resolve slug → id → manifest client-side (the BFF is the seam).
  return <StudioLoader slug={id} />;
}
