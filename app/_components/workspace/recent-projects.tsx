import { DEMO_PROJECTS, sortByLastOpened } from "@/lib/workspace/projects-model";
import OctocatIcon from "../octocat-icon";

/** 10a's "Recent projects" grid + dashed new-project card + info bar. The
 *  dashed card opens the New-project wizard; each card's "Open ▸" routes to
 *  `/studio/<id>` (callbacks lifted to `workspace-home`, which owns the wizard
 *  open-state and the router). */
export default function RecentProjects({
  onNewProject,
  onOpenProject,
}: {
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
}) {
  const projects = sortByLastOpened(DEMO_PROJECTS);

  return (
    <div style={{ padding: "0 34px 30px" }}>
      <div
        className="flex items-center"
        style={{ gap: 12, marginBottom: 14 }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: ".18em",
            color: "var(--sg-dim)",
          }}
        >
          {"RECENT PROJECTS"}
        </div>
        <div style={{ flex: 1, height: 1, background: "var(--sg-line)" }} />
        <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--sg-dim)" }}>
          {"Sorted by last opened ▾"}
        </span>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}
      >
        {projects.map((p) => (
          <div
            key={p.id}
            data-testid={`project-open-${p.id}`}
            onClick={() => onOpenProject(p.id)}
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            style={{
              border: "1px solid var(--sg-line2)",
              borderRadius: 14,
              overflow: "hidden",
              background: "var(--sg-panel)",
            }}
          >
            <div
              style={{
                height: 118,
                position: "relative",
                overflow: "hidden",
                background: p.posterGradient,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  boxShadow: "inset 0 0 70px rgba(20,8,4,.7)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: 12,
                  fontFamily: "var(--font-anton)",
                  fontSize: 15,
                  color: "#fff",
                  textShadow: "0 1px 4px rgba(0,0,0,.6)",
                }}
              >
                {p.posterLabel}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 9,
                  right: 10,
                  fontWeight: 700,
                  fontSize: 9,
                  letterSpacing: ".1em",
                  padding: "3px 8px",
                  borderRadius: 5,
                  color: p.status === "RENDERED" ? "#160f14" : "#fff",
                  background:
                    p.status === "RENDERED"
                      ? "rgba(255,232,168,.94)"
                      : "rgba(201,154,63,.9)",
                }}
              >
                {p.status}
              </div>
            </div>
            <div style={{ padding: "14px 15px 15px" }}>
              <div
                style={{
                  fontFamily: "var(--font-barlow-semi)",
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: 1.1,
                }}
              >
                {p.title}
              </div>
              <div
                className="flex items-center"
                style={{
                  gap: 6,
                  marginTop: 6,
                  fontSize: 12,
                  color: "var(--sg-dim)",
                }}
              >
                <OctocatIcon size={13} />
                {p.repo}
              </div>
              <div
                className="flex items-center"
                style={{
                  gap: 10,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid var(--sg-line)",
                  fontSize: 11.5,
                  color: "var(--sg-dim)",
                }}
              >
                <span>{p.opened}</span>
                <span style={{ opacity: 0.5 }}>{"·"}</span>
                <span>{p.branch}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontWeight: 700, color: "var(--sg-red)" }}>
                  {"Open ▸"}
                </span>
              </div>
            </div>
          </div>
        ))}

        <div
          data-testid="recent-new-project-card"
          onClick={onNewProject}
          role="button"
          tabIndex={0}
          className="flex flex-col items-center justify-center cursor-pointer"
          style={{
            border: "1.5px dashed var(--sg-line2)",
            borderRadius: 14,
            gap: 9,
            minHeight: 210,
            color: "var(--sg-dim)",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: "rgba(192,57,43,.1)",
              border: "1px solid rgba(192,57,43,.3)",
              display: "grid",
              placeItems: "center",
              color: "var(--sg-red)",
              fontSize: 22,
            }}
          >
            {"＋"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-barlow-semi)",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--sg-fg)",
            }}
          >
            {"New project"}
          </div>
          <div style={{ fontSize: 12 }}>{"Start from a verse or a demo"}</div>
        </div>
      </div>

      <div
        className="flex items-center"
        style={{
          marginTop: 14,
          gap: 8,
          padding: "12px 15px",
          border: "1px solid var(--sg-line)",
          borderRadius: 11,
          background: "var(--sg-panel)",
          fontSize: 12.5,
          color: "var(--sg-dim)",
        }}
      >
        <span style={{ color: "var(--sg-gold)" }}>{"ⓘ"}</span>
        {" Projects live in "}
        <b style={{ color: "var(--sg-fg)", fontWeight: 700 }}>
          {"your GitHub repos"}
        </b>
        {
          " — Supagloo clones them to a temporary workspace when you open one, and pushes your changes back. Nothing is stored on our servers."
        }
      </div>
    </div>
  );
}
