import { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  SquarePen,
  Files,
  ClipboardCheck,
  CalendarDays,
  History,
  Images,
  Settings2,
  Menu,
  LogOut,
  ChevronRight,
  ArrowUpRight,
  X,
  Check,
  Layers3,
} from "lucide-react";
import { status, type Workspace } from "../../packages/shared/model.ts";
import { request, message } from "./api.ts";
import { Brand, Empty, OrgMark } from "./primitives.tsx";
import { Overview, PostList } from "./overview.tsx";
import { Composer } from "./composer.tsx";
import { Review } from "./review.tsx";
import { Settings } from "./settings.tsx";
import { Calendar } from "./calendar.tsx";
import { AccountEntry } from "./account-entry.tsx";
import "./studio.css";
const nav = [
  { name: "Overview", id: "overview", icon: LayoutDashboard },
  { name: "Create post", id: "create", icon: SquarePen },
  { name: "Drafts", id: "drafts", icon: Files },
  { name: "Awaiting approval", id: "approvals", icon: ClipboardCheck },
  { name: "Scheduled", id: "scheduled", icon: CalendarDays },
  { name: "Publishing history", id: "history", icon: History },
  { name: "Media library", id: "media", icon: Images },
  { name: "Settings", id: "settings", icon: Settings2 },
];
function LocalLogin({
  error,
  refresh,
}: {
  error: string;
  refresh: () => Promise<void>;
}) {
  const [problem, setProblem] = useState("");
  const [role, select] = useState("designer");
  const [busy, lock] = useState(false);
  async function login() {
    lock(true);
    try {
      await request("/local/sign-in", { role });
      await refresh();
    } catch (error) {
      setProblem(message(error));
    } finally {
      lock(false);
    }
  }
  return (
    <div className="entry">
      <Brand />
      <main className="entry-layout">
        <div className="entry-panel">
          <p className="overline">Local preview</p>
          <h1>Editorial sign-in</h1>
          <p>
            Choose a local role to work with drafts and approvals. Live
            publishing is disabled.
          </p>
          <label>
            Preview role
            <select
              value={role}
              onChange={(event) => select(event.target.value)}
            >
              <option value="designer">Designer</option>
              <option value="administrator">Administrator</option>
            </select>
          </label>
          {(problem || error) && (
            <p role="alert" className="error">
              {problem || error}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            className="primary"
            onClick={() => void login()}
          >
            Open workspace
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="entry-art">
          <img
            src="/press.svg"
            alt="Line engraving of a hand-operated printing press"
          />
        </div>
      </main>
    </div>
  );
}
function App() {
  const [w, setWorkspace] = useState<Workspace | null>(null),
    [local, setLocal] = useState(false),
    [loaded, ready] = useState(false),
    [err, setErr] = useState(""),
    [path, setPath] = useState(location.hash.slice(1) || "overview"),
    [mobile, menu] = useState(false),
    [toast, notify] = useState("");
  const refresh = useCallback(async () => {
    const res = await fetch("/api/workspace");
    if (res.status === 401 || res.status === 403) {
      setWorkspace(null);
      setErr(
        res.status === 403
          ? "Access requires an invitation from your administrator."
          : "",
      );
      return;
    }
    if (!res.ok) throw new Error("Could not load the workspace. Try again.");
    setWorkspace((await res.json()) as Workspace);
    setErr("");
  }, []);
  useEffect(() => {
    Promise.all([
      request<{ local: boolean }>("/api/entry").then((x) => setLocal(x.local)),
      refresh(),
    ])
      .catch((e) => setErr(message(e)))
      .finally(() => ready(true));
  }, [refresh]);
  useEffect(() => {
    const nav = () => {
      setPath(location.hash.slice(1) || "overview");
      menu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", nav);
    return () => window.removeEventListener("hashchange", nav);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!w) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible")
        refresh().catch((e) => setErr(message(e)));
    }, 60000);
    return () => clearInterval(id);
  }, [w, refresh]);
  if (!loaded)
    return (
      <main className="loading">
        <Brand />
        <p>Opening workspace…</p>
      </main>
    );
  if (!local && (!w || path.startsWith("join/") || path.startsWith("reset/")))
    return <AccountEntry path={path} error={err} refresh={refresh} />;
  if (!w) return <LocalLogin error={err} refresh={refresh} />;
  const [page, id] = path.split("/"),
    p = w.posts.find((x) => x.id === id),
    props = { w, refresh, notify };
  const draftKeys = ["draft", "rejected", "changes_requested", "cancelled"];
  const selected =
    nav.find((n) => n.id === page)?.name ||
    { post: "Post details", edit: "Edit draft", posts: "All posts" }[page] ||
    "Workspace";
  const filtered = w.posts.filter((p) =>
    page === "drafts"
      ? draftKeys.includes(p.state)
      : page === "approvals"
        ? ["submitted", "approved"].includes(p.state)
        : page === "history"
          ? p.jobs.length > 0
          : true,
  );
  let content: React.ReactNode;
  if (page === "overview") content = <Overview w={w} />;
  else if (page === "create" || (page === "edit" && p))
    content = <Composer key={path} {...props} post={p} />;
  else if (page === "post" && p)
    content = <Review key={p.id} post={p} {...props} />;
  else if (page === "settings") content = <Settings {...props} />;
  else if (page === "scheduled")
    content = (
      <>
        <header className="page-head">
          <div>
            <p className="overline">Calendar</p>
            <h1>Scheduled</h1>
          </div>
        </header>
        <Calendar
          w={w}
          posts={w.posts.filter((p) =>
            ["queued", "scheduled", "sending"].includes(status(p)),
          )}
        />
      </>
    );
  else if (page === "media")
    content = (
      <>
        <header className="page-head">
          <div>
            <p className="overline">Assets</p>
            <h1>Media library</h1>
          </div>
          <a className="secondary" href="#create">
            Upload in composer
            <ArrowUpRight size={15} />
          </a>
        </header>
        {w.media.length ? (
          <div className="gallery">
            {w.media.map((m) => (
              <figure key={m.id}>
                <a href={"/api/media/" + m.id} target="_blank" rel="noreferrer">
                  <img src={"/api/media/" + m.id} alt={m.name} />
                </a>
                <figcaption>
                  {m.name}
                  <small>
                    {m.width} × {m.height} · {Math.ceil(m.bytes / 1024)} KB
                  </small>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <Empty title="Your media library is empty">
            Upload a graphic in the composer to add it to the library.
          </Empty>
        )}
      </>
    );
  else if (["drafts", "approvals", "history", "posts"].includes(page))
    content = (
      <>
        <header className="page-head">
          <div>
            <p className="overline">Editorial records</p>
            <h1>{selected}</h1>
          </div>
          <a className="secondary" href="#create">
            <SquarePen size={16} />
            Create post
          </a>
        </header>
        {page === "approvals" && (
          <p className="muted">
            Review submissions and schedule approved posts.
          </p>
        )}
        <PostList w={w} posts={filtered} />
      </>
    );
  else
    content = (
      <Empty title="Page unavailable">
        <a href="#overview">Return to overview</a>
      </Empty>
    );
  return (
    <div className="app">
      <button
        type="button"
        className="skip"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("maincontent")?.focus();
        }}
      >
        Skip to content
      </button>
      <header className="topbar">
        <div>
          <button
            type="button"
            className="mobile-toggle"
            aria-label="Toggle navigation"
            aria-expanded={mobile}
            onClick={() => menu(!mobile)}
          >
            {mobile ? <X /> : <Menu />}
          </button>
          <Brand />
        </div>
        <span className="org">
          <OrgMark />
          {w.org.name}
        </span>
      </header>
      <aside className={"rail " + (mobile ? "open" : "")}>
        <nav aria-label="Workspace">
          <span className="nav-label">Workspace</span>
          {nav.map((n, i) => (
            <a
              key={n.id}
              className={
                (page === n.id ? "active " : "") + (i === 6 ? "divided" : "")
              }
              aria-current={page === n.id ? "page" : undefined}
              href={"#" + n.id}
            >
              <n.icon size={18} strokeWidth={1.65} />
              {n.name}
            </a>
          ))}
        </nav>
        <div className="account">
          <span className="initial">{w.user.email[0].toUpperCase()}</span>
          <div>
            <strong>{w.user.email.split("@")[0]}</strong>
            <small>{w.user.role}</small>
          </div>
          <a
            aria-label="Sign out"
            href={w.local ? "/local/logout" : "/"}
            onClick={(event) => {
              sessionStorage.clear();
              if (!w.local) {
                event.preventDefault();
                void request("/api/auth/sign-out", {})
                  .then(() => location.assign("/"))
                  .catch((error) => notify(message(error)));
              }
            }}
          >
            <LogOut size={16} />
          </a>
        </div>
      </aside>
      <main className="main" id="maincontent" tabIndex={-1}>
        <div className="breadcrumb">
          <Layers3 size={14} />
          <a href="#overview">Studio</a>
          <ChevronRight size={12} />
          {selected}
        </div>
        {err && (
          <p role="alert" className="error">
            {err}
          </p>
        )}
        {content}
      </main>
      {toast && (
        <div role="status" className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
