"use client";

import { useEffect, useState } from "react";
import StudioApp from "./studio-app";
import StudioNotFoundBody from "./studio-not-found-body";
import { loadStudioProject, type StudioLoadResult } from "@/lib/studio/studio-data";
import type { StudioProject } from "@/lib/studio/project";
import { WS_TOKENS } from "../ws-tokens";
import styles from "../studio.module.css";

/**
 * The REAL-mode studio resolver (Task #27). The Server Component (`[id]/page.tsx`)
 * renders the mock catalog synchronously in demo builds; every OTHER id lands here,
 * where the project is resolved CLIENT-side from the real API (matching the app's
 * established client-fetches / BFF-is-the-seam convention — see `HomeSwitch` /
 * `session-provider`): `GET /api/projects` (slug→id) → `GET /api/projects/:id` →
 * `GET /api/projects/:id/manifest?ref=` → hydrate the reducer from the Zod-parsed
 * `ProjectManifest`.
 *
 * A miss renders the SAME themed 404 body as the mock `notFound()` (the E-SP4 spec
 * accepts either); a manifest read error (missing / not-connected / corrupt) renders
 * a distinct load-error body so the two are not conflated.
 */
export default function StudioLoader({ slug }: { slug: string }) {
  const [result, setResult] = useState<StudioLoadResult | null>(null);

  useEffect(() => {
    let active = true;
    // Reset to the loading state when the slug changes (a same-position re-navigation
    // to another /studio/<slug>). Matches session-provider's mount-effect convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(null);
    void (async () => {
      const r = await loadStudioProject(slug);
      if (active) setResult(r);
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  if (result === null) return <StudioLoadingBody />;
  if (result.status === "ready") return <StudioReady project={result.project} />;
  if (result.status === "not_found") return <StudioNotFoundBody />;
  // status === "error" — the project resolved but its composition couldn't be read.
  return (
    <StudioNotFoundBody
      testId="studio-load-error"
      headline="COULDN'T LOAD PROJECT"
      body="We found this project, but couldn't read its composition. Check the GitHub connection and try again."
    />
  );
}

function StudioReady({ project }: { project: StudioProject }) {
  return (
    <div className={styles.backdrop} style={WS_TOKENS}>
      <StudioApp project={project} />
    </div>
  );
}

function StudioLoadingBody() {
  return (
    <div className={styles.backdrop} style={WS_TOKENS}>
      <div
        data-testid="studio-loading"
        style={{
          textAlign: "center",
          color: "var(--ws-dim)",
          fontFamily: "var(--font-barlow), sans-serif",
          fontSize: 15,
        }}
      >
        {"Loading your project…"}
      </div>
    </div>
  );
}
