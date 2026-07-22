import Link from "next/link";
import { WS_TOKENS } from "../ws-tokens";
import styles from "../studio.module.css";

/**
 * The themed studio "not found" / load-error body (Task #27). Extracted from
 * `app/studio/not-found.tsx` so BOTH the route-level `notFound()` handler (mock
 * catalog miss) AND the real-mode client resolver (`StudioLoader`, when the slug
 * matches no project or its manifest is missing/corrupt) render the identical
 * themed 404 — the E-SP4 routing spec accepts either a real 404 or this body.
 *
 * `headline`/`body` are overridable so the resolver can distinguish "project not
 * found" from a "couldn't load composition" load error while reusing one shell.
 */
export default function StudioNotFoundBody({
  testId = "studio-not-found",
  headline = "PROJECT NOT FOUND",
  body = "That project doesn't exist, or it's no longer available on this workspace.",
}: {
  testId?: string;
  headline?: string;
  body?: string;
}) {
  return (
    <div className={styles.backdrop} style={WS_TOKENS}>
      <div
        data-testid={testId}
        style={{
          textAlign: "center",
          color: "var(--ws-ink)",
          fontFamily: "var(--font-barlow), sans-serif",
          maxWidth: 460,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-anton), sans-serif",
            fontSize: 44,
            lineHeight: 1.02,
            letterSpacing: ".01em",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--ws-dim)",
            marginTop: 14,
          }}
        >
          {body}
        </div>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 22,
            padding: "12px 20px",
            borderRadius: 11,
            border: "1px solid var(--ws-line-3)",
            color: "var(--ws-ink)",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          {"← Back to workspace"}
        </Link>
      </div>
    </div>
  );
}
