import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ClipboardCheck,
  PenLine,
  Plus,
  FileText,
  CircleAlert,
} from "lucide-react";
import {
  platforms,
  names,
  status,
  type Post,
  type Workspace,
} from "../../packages/shared/model.ts";
import { Badge, Network, Empty } from "./primitives.tsx";
import { date } from "./api.ts";
export function PostList({
  posts,
  w,
  empty = "No posts here yet",
}: {
  posts: Post[];
  w: Workspace;
  empty?: string;
}) {
  return posts.length ? (
    <div className="postlist">
      {posts.map((p) => (
        <a className="postrow" key={p.id} href={"#post/" + p.id}>
          {p.media_id ? (
            <img src={"/api/media/" + p.media_id} alt="" />
          ) : (
            <FileText size={24} />
          )}
          <span className="rowcopy">
            <strong>{p.caption || "Untitled post"}</strong>
            <small>
              {date(p.updated, w.org.timezone)} ·{" "}
              {Object.keys(p.variants)
                .map((k) => names[k as keyof typeof names])
                .join(", ") || "No platforms"}
            </small>
          </span>
          <Badge state={status(p)} />
          <ArrowUpRight size={16} />
        </a>
      ))}
    </div>
  ) : (
    <Empty title={empty}>Saved posts will appear here.</Empty>
  );
}
export function Overview({ w }: { w: Workspace }) {
  const states = w.posts.map(status);
  const metrics = [
    {
      name: "Drafts",
      link: "drafts",
      keys: ["draft", "changes_requested", "rejected"],
      icon: PenLine,
    },
    {
      name: "Awaiting approval",
      link: "approvals",
      keys: ["submitted"],
      icon: ClipboardCheck,
    },
    {
      name: "Scheduled",
      link: "scheduled",
      keys: ["scheduled", "queued", "sending"],
      icon: CalendarDays,
    },
    {
      name: "Published",
      link: "history",
      keys: ["published"],
      icon: CheckCheck,
    },
  ];
  return (
    <>
      <header className="page-head">
        <div>
          <p className="overline">Workspace</p>
          <h1>Overview</h1>
        </div>
        <span className="today">
          <CalendarDays size={15} />
          {new Intl.DateTimeFormat("en", {
            weekday: "short",
            month: "long",
            day: "numeric",
            timeZone: w.org.timezone,
          }).format(new Date())}
        </span>
      </header>
      <section className="hero">
        <div>
          <span className="hero-kicker">Publishing desk</span>
          <h2>Prepare your next post</h2>
          <p>Add a graphic and caption, then send them for approval.</p>
          <a className="hero-button" href="#create">
            <Plus size={16} />
            Create post
          </a>
        </div>
        <img src="/press.svg" alt="" className="press" />
      </section>
      <div className="section-title space">
        <h2>Publishing pipeline</h2>
      </div>
      <div className="metrics">
        {metrics.map((m) => (
          <a href={"#" + m.link} key={m.link}>
            <div>
              <m.icon size={17} />
              <ArrowUpRight size={13} />
            </div>
            <strong>{states.filter((s) => m.keys.includes(s)).length}</strong>
            <span>{m.name}</span>
          </a>
        ))}
      </div>
      {states.some((s) => ["partial", "failed", "unknown"].includes(s)) && (
        <a className="attention" href="#history">
          <CircleAlert size={16} />
          Deliveries need attention
          <ArrowRight size={16} />
        </a>
      )}
      <div className="overview-bottom">
        <section>
          <div className="section-title">
            <h2>Recent posts</h2>
            <a href="#posts">
              View all <ArrowRight size={14} />
            </a>
          </div>
          <PostList posts={w.posts.slice(0, 5)} w={w} empty="No posts yet" />
        </section>
        <section>
          <div className="section-title">
            <h2>Channels</h2>
            <a href="#settings" aria-label="Channel settings">
              <ArrowUpRight size={16} />
            </a>
          </div>
          {platforms.map((p) => (
            <div className="channel-line" key={p}>
              <Network p={p} />
              <strong>{names[p]}</strong>
              <small>
                {w.channels.find((c) => c.platform === p)?.name ||
                  "Unconnected"}
              </small>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
