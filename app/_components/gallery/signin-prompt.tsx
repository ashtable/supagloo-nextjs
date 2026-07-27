"use client";

import Modal from "../modal";
import SignInButton from "../sign-in-button";

/**
 * UNDESIGNED (design-delta §2.7 / §9-Q3 — NOT "§5", which is "System architecture
 * (target)" and declares nothing out of scope; miscitation corrected 2026-07-26). There
 * is no designed prompt for an anonymous voter — Turns 16 and 17 do not draw one either
 * — so this is a minimal placeholder built from the shared `Modal` + the existing
 * `SignInButton`, flagged for the design pass.
 *
 * It exists because the alternative is worse: an anonymous click on an upvote pill has
 * to do SOMETHING, and silently dropping the vote (or optimistically filling a pill the
 * server will never honour) would lie about what happened.
 *
 * ── TWO REASONS, TWO SENTENCES ──────────────────────────────────────────────────
 * `/gallery` is public, so BOTH of its signed-in actions are reachable by an anonymous
 * visitor: the upvote pill and `＋ Share yours`. They need the same modal and the same
 * button, and they must not carry the same words — "SIGN IN TO UPVOTE" over a share
 * action is the wrong sentence in the right place, and each reason names a different
 * thing the account is actually for. One component with a `reason`, rather than two
 * near-identical modals that will drift.
 */
export default function SigninPrompt({
  open,
  reason = "upvote",
  onClose,
}: {
  open: boolean;
  /** What the visitor just tried to do. Chooses the title and the sentence. */
  reason?: "upvote" | "publish";
  onClose: () => void;
}) {
  const copy = REASONS[reason];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      testId="gallery-signin-prompt"
      width={420}
    >
      <div className="flex flex-col" style={{ gap: 16, padding: "20px 22px 24px" }}>
        <p
          style={{
            fontFamily: "var(--font-zilla)",
            fontSize: 15,
            lineHeight: 1.5,
            color: "var(--sg-dim)",
          }}
        >
          {copy.body}
        </p>
        <SignInButton variant="heroMobile" testId="gallery-signin-button" />
      </div>
    </Modal>
  );
}

/** The title matches the verb on the control the visitor pressed — the header's CTA
 *  says `＋ Share yours`, so its prompt says SHARE. An interface that renames an action
 *  between the button and the dialog it opens is one the reader has to re-learn. */
const REASONS = {
  upvote: {
    title: "SIGN IN TO UPVOTE",
    body: "Upvotes are tied to your YouVersion account, so we know whose vote is whose.",
  },
  publish: {
    title: "SIGN IN TO SHARE",
    body: "Publishing is tied to your YouVersion account, so the gallery knows whose video is whose.",
  },
} as const;
