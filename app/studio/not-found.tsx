import StudioNotFoundBody from "./_components/studio-not-found-body";

/**
 * The themed studio 404, rendered when `[id]/page.tsx` calls `notFound()` on an
 * unknown mock-catalog project id (and by the bare-`/studio` guard page). Copy
 * literally reads "PROJECT NOT FOUND" so the route reports a not-found signal. The
 * markup lives in the shared `StudioNotFoundBody` so the real-mode resolver renders
 * the identical body on a real miss.
 */
export default function StudioNotFound() {
  return <StudioNotFoundBody />;
}
