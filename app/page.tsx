import type { Metadata } from "next";
import PublicLanding from "./_components/landing/public-landing";
import HomeSwitch from "./_components/home-switch";
import WorkspaceHome from "./_components/workspace/workspace-home";

export const metadata: Metadata = {
  title: "Supagloo — Turn Scripture into cinematic video",
  description:
    "Pick a verse — Supagloo storyboards it, narrates it in the voice you describe, and scores it into a share-ready short. Built on the YouVersion Platform.",
};

/**
 * `/` branches signed-out vs. signed-in without a server session (plan
 * D-ROUTE). Stays a static Server Component: both trees are passed to the
 * client `HomeSwitch` as PROPS, so `PublicLanding` still server-renders for
 * signed-out visitors + SEO (a client component can render an RSC given to it
 * as a prop, but cannot import one).
 */
export default function Home() {
  return (
    <HomeSwitch
      publicLanding={<PublicLanding />}
      workspace={<WorkspaceHome />}
    />
  );
}
