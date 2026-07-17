import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StudioApp from "../_components/studio-app";
import { findStudioProject } from "@/lib/studio/project";
import { WS_TOKENS } from "../ws-tokens";
import styles from "../studio.module.css";

/**
 * Turn 13b — the `/studio/[id]` "Wilderness Studio" editor. A Server-Component
 * shell (theme wrapper + id→project lookup) hosting the client editor island.
 * The id in the URL is the entire handoff (no cross-page store): `findStudioProject`
 * resolves it, an unknown id → `notFound()` (A6). `params` is a Promise in Next 16.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = findStudioProject(id);
  if (!project) return { title: "Project not found — Studio" };
  return {
    title: `${project.projectName} — Studio`,
    description:
      "Edit your scripture-video storyboard — scenes, captions, narrator voice, music & timing — on your project's working version branch.",
  };
}

export default async function StudioProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = findStudioProject(id);
  if (!project) notFound();

  return (
    <div className={styles.backdrop} style={WS_TOKENS}>
      <StudioApp project={project} />
    </div>
  );
}
