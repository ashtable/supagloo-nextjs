import Link from "next/link";
import { WS_TOKENS } from "./ws-tokens";
import styles from "./studio.module.css";

/**
 * The themed studio 404, rendered when `[id]/page.tsx` calls `notFound()` on an
 * unknown project id (and by the bare-`/studio` guard page). Copy literally reads
 * "PROJECT NOT FOUND" so the route reports a not-found signal.
 */
export default function StudioNotFound() {
  return (
    <div className={styles.backdrop} style={WS_TOKENS}>
      <div
        data-testid="studio-not-found"
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
          {"PROJECT NOT FOUND"}
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
          {
            "That project doesn't exist, or it's no longer available on this workspace."
          }
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
