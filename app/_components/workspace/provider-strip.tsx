"use client";

import { useRouter } from "next/navigation";
import { useSession } from "../session-provider";
import { stripItems, type Provider } from "@/lib/connections/connections-model";
import OctocatIcon from "../octocat-icon";

function ProviderTile({ provider }: { provider: Provider }) {
  if (provider === "github") {
    return (
      <span
        style={{
          width: 20,
          height: 20,
          flex: "none",
          display: "grid",
          placeItems: "center",
        }}
      >
        <OctocatIcon size={18} />
      </span>
    );
  }
  if (provider === "openrouter") {
    return (
      <span
        style={{
          width: 20,
          height: 20,
          flex: "none",
          borderRadius: 6,
          background: "linear-gradient(150deg,#c99a3f,#6d3b26)",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontWeight: 800,
          fontSize: 11,
        }}
      >
        {"OR"}
      </span>
    );
  }
  return (
    <span
      style={{
        width: 20,
        height: 20,
        flex: "none",
        borderRadius: 6,
        background: "linear-gradient(150deg,#d4a24c,#c0392b)",
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontWeight: 800,
        fontSize: 11,
      }}
    >
      {"G"}
    </span>
  );
}

/** 10a's provider status strip — 3 compact cards from `stripItems(connections)`. */
export default function ProviderStrip() {
  const router = useRouter();
  const { connections } = useSession();
  const items = stripItems(connections);

  return (
    <div style={{ padding: "0 34px 22px", display: "flex", gap: 12 }}>
      {items.map((item) => {
        const notLinked = item.dotColor === null && item.linkLabel !== null;
        return (
          <div
            key={item.provider}
            className="flex items-center"
            style={{
              flex: 1,
              gap: 11,
              padding: "13px 16px",
              borderRadius: 12,
              border: notLinked
                ? "1px solid rgba(192,57,43,.3)"
                : "1px solid var(--sg-line)",
              background: notLinked ? "rgba(192,57,43,.06)" : "var(--sg-panel)",
            }}
          >
            <ProviderTile provider={item.provider} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{item.label}</div>
              <div
                style={{
                  fontSize: 11.5,
                  color: notLinked ? "var(--sg-red)" : "var(--sg-dim)",
                }}
              >
                {item.sub}
              </div>
            </div>
            {item.dotColor ? (
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: item.dotColor,
                  flex: "none",
                }}
              />
            ) : item.linkLabel ? (
              <button
                type="button"
                onClick={() => router.push("/profile")}
                className="cursor-pointer"
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  color: "var(--sg-red)",
                  background: "transparent",
                  border: "none",
                }}
              >
                {item.linkLabel}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
