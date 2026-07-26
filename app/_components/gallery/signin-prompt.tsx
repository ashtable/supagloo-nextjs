"use client";

import Modal from "../modal";
import SignInButton from "../sign-in-button";

/**
 * UNDESIGNED (design-delta §5) — there is no designed prompt for an anonymous voter, so
 * this is a minimal placeholder built from the shared `Modal` + the existing
 * `SignInButton`, flagged for the design pass.
 *
 * It exists because the alternative is worse: an anonymous click on an upvote pill has
 * to do SOMETHING, and silently dropping the vote (or optimistically filling a pill the
 * server will never honour) would lie about what happened.
 */
export default function SigninPrompt({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="SIGN IN TO UPVOTE"
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
          {"Upvotes are tied to your YouVersion account, so we know whose vote is whose."}
        </p>
        <SignInButton variant="heroMobile" testId="gallery-signin-button" />
      </div>
    </Modal>
  );
}
