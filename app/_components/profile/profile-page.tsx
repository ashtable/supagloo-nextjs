"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../session-provider";
import ConnectionCard from "./connection-card";
import ConnectGithubModal from "../connect/connect-github-modal";
import ConnectOpenRouterModal from "../connect/connect-openrouter-modal";
import HolyBibleGlyph from "../holy-bible-glyph";
import type { Provider } from "@/lib/connections/connections-model";

/**
 * 10b — profile & connections. Server-shell-hosts-client-island (the `/studio`
 * template): `app/profile/page.tsx` is the RSC shell, this is the client
 * island. Owns the 11b/11c modal open-state (plan §3). Signed-out visitors are
 * redirected to `/` — there is no server session to gate this route with.
 */
export default function ProfilePage() {
  const router = useRouter();
  const { mounted, session, connections, connectProvider, disconnectProvider, signOut } =
    useSession();
  const [modal, setModal] = useState<"github" | "openrouter" | null>(null);

  useEffect(() => {
    if (mounted && !session.isAuthed) {
      router.replace("/");
    }
  }, [mounted, session.isAuthed, router]);

  if (!mounted || !session.isAuthed) return null;

  const name = session.user?.name ?? "";
  const email = session.user?.email ?? "";
  const monogram = (name.trim().split(/\s+/).filter(Boolean).slice(0, 2) as string[])
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const openModal = (provider: Provider) => {
    if (provider === "github" || provider === "openrouter") setModal(provider);
  };

  return (
    <div
      data-testid="profile-page"
      className="min-h-screen w-full flex-1"
      style={{
        background: "var(--sg-bg)",
        color: "var(--sg-fg)",
        fontFamily: "var(--font-barlow)",
      }}
    >
      <div className="mx-auto w-full" style={{ maxWidth: 860 }}>
        <div
          className="flex items-center"
          style={{
            height: 64,
            gap: 14,
            padding: "0 28px",
            borderBottom: "1px solid var(--sg-line)",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/")}
            className="cursor-pointer"
            style={{
              fontSize: 13,
              color: "var(--sg-dim)",
              fontWeight: 600,
              background: "transparent",
              border: "none",
            }}
          >
            {"← Workspace"}
          </button>
          <div style={{ flex: 1 }} />
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              backgroundImage: "var(--sg-grad)",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 12,
              color: "#fff",
            }}
          >
            {monogram}
          </span>
        </div>

        <div
          className="flex items-center"
          style={{
            padding: "30px 34px 20px",
            gap: 18,
            borderBottom: "1px solid var(--sg-line)",
          }}
        >
          <span
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundImage: "var(--sg-grad)",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 24,
              color: "#fff",
              flex: "none",
              boxShadow: "0 6px 16px rgba(192,57,43,.3)",
            }}
          >
            {monogram}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-anton)", fontSize: 30, lineHeight: 1 }}>
              {name.toUpperCase()}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--sg-dim)", marginTop: 3 }}>
              {`${email} · signed in with YouVersion`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="flex items-center cursor-pointer"
            style={{
              gap: 7,
              padding: "10px 16px",
              border: "1px solid var(--sg-line2)",
              borderRadius: 11,
              fontWeight: 700,
              fontSize: 13,
              color: "var(--sg-fg)",
              background: "transparent",
            }}
          >
            <HolyBibleGlyph size={20} />
            {"Sign out"}
          </button>
        </div>

        <div style={{ padding: "26px 34px 34px" }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: ".18em",
              color: "var(--sg-dim)",
              marginBottom: 6,
            }}
          >
            {"CONNECTED ACCOUNTS"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-zilla)",
              fontSize: 14,
              color: "var(--sg-dim)",
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            {
              "Link the services Supagloo uses to store your projects and run AI models. You control every connection."
            }
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(["github", "openrouter", "gloo"] as const).map((provider) => (
              <ConnectionCard
                key={provider}
                provider={provider}
                connections={connections}
                onConnect={() => connectProvider(provider)}
                onDisconnect={() => disconnectProvider(provider)}
                onOpenModal={openModal}
              />
            ))}
          </div>

          <div
            className="flex items-center"
            style={{
              marginTop: 18,
              gap: 8,
              padding: "12px 15px",
              border: "1px solid var(--sg-line)",
              borderRadius: 11,
              background: "var(--sg-panel)",
              fontSize: 12.5,
              color: "var(--sg-dim)",
            }}
          >
            <span style={{ color: "var(--sg-gold)" }}>{"🔒"}</span>
            {" All tokens & secrets are encrypted at rest. Supagloo is "}
            <b style={{ color: "var(--sg-fg)", fontWeight: 700 }}>{"100% free"}</b>
            {" — you only ever pay your own model providers."}
          </div>
        </div>
      </div>

      <ConnectGithubModal open={modal === "github"} onClose={() => setModal(null)} />
      <ConnectOpenRouterModal
        open={modal === "openrouter"}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
