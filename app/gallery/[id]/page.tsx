import type { Metadata } from "next";
import Nav from "../../_components/landing/nav";
import Footer from "../../_components/landing/footer";
import WatchView from "../../_components/gallery/watch-view";
import { forwardToApi } from "@/lib/api/proxy";
import { GalleryItemDetailResponseSchema } from "@/lib/api/contracts";

/**
 * `/gallery/[id]` (Turn 16a) — the watch page. A SERVER SHELL hosting the mount-gated
 * client island, exactly as `/gallery` does.
 *
 * Shell metrics are lifted verbatim from `app/gallery/page.tsx` (the 1320px column, the
 * background/colour/font trio) so this reads as the same site rather than a second one.
 * The nav band wears the `watch` variant — `‹ Gallery` back link, centred lockup, user
 * pill, and no site links — and the footer stays server-rendered.
 *
 * This is the app's **one genuinely shareable public URL**: an item is a thing people
 * send each other, which is why it is a real route and not the modal row 41 shipped, and
 * why it is the only page in the product with a data-driven `generateMetadata`.
 */
/**
 * Titles a share with the item's own name.
 *
 * Reads the API DIRECTLY through `forwardToApi` rather than through this app's own BFF
 * route: a server component cannot fetch its own relative URL, and the BFF hop would add
 * nothing but a second network leg — `GET /v1/gallery/:id` is `optionalAuth` and metadata
 * is public by definition, so no session is involved. `forwardToApi` never throws, so a
 * dead API costs the generic title and nothing else; the page below still renders and
 * still shows the reader an honest state.
 *
 * **No `openGraph.images`, deliberately.** Every image URL in this product is a
 * short-lived presign (`thumbnailUrl` included), and a share card whose image 403s a few
 * minutes after posting is worse than a card with no image at all. A real OG image needs
 * a stably-addressable public object, which nothing here has yet.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: "Watch — Supagloo",
    description: "A scripture video made with Supagloo.",
  };

  const { id } = await params;
  const result = await forwardToApi({
    path: `gallery/${encodeURIComponent(id)}`,
    method: "GET",
  });
  const parsed = GalleryItemDetailResponseSchema.safeParse(result.body);
  if (!parsed.success) return fallback;

  const { item } = parsed.data;
  const description = `${item.scriptureReference} (${item.translation}), made by ${item.owner.displayName} with Supagloo.`;
  return {
    title: `${item.title} — Supagloo`,
    description,
    openGraph: {
      title: item.title,
      description,
      type: "video.other",
    },
  };
}

export default async function GalleryWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div
      className="min-h-screen w-full flex-1"
      style={{
        background: "var(--sg-bg)",
        color: "var(--sg-fg)",
        fontFamily: "var(--font-barlow)",
      }}
    >
      <div className="mx-auto w-full max-w-[1320px]">
        <Nav variant="watch" back={{ href: "/gallery", label: "‹ Gallery" }} />
        <WatchView itemId={id} />
        <Footer />
      </div>
    </div>
  );
}
