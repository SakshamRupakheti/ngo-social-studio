import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Post, Workspace } from "../../packages/shared/model.ts";
import { PostList } from "./overview.tsx";
export function Calendar({ posts, w }: { posts: Post[]; w: Workspace }) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: w.org.timezone,
  });
  const start = fmt.formatToParts(Date.now()),
    current = (part: string) =>
      Number(start.find((x) => x.type === part)?.value);
  const [month, setMonth] = useState(
      new Date(current("year"), current("month") - 1, 1),
    ),
    [day, select] = useState("");
  const offset = (month.getDay() + 6) % 7,
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const key = (d: number) =>
    [
      month.getFullYear(),
      String(month.getMonth() + 1).padStart(2, "0"),
      String(d).padStart(2, "0"),
    ].join("-");
  function change(delta: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
    select("");
  }
  return (
    <>
      <div className="month">
        <h2>
          {month.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button
          type="button"
          onClick={() => change(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={() => change(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
          <small key={x}>{x}</small>
        ))}
        {["mon", "tue", "wed", "thu", "fri", "sat"]
          .slice(0, offset)
          .map((day) => (
            <span key={day} />
          ))}
        {Array.from({ length: days }, (_, idx) => {
          const d = idx + 1,
            k = key(d),
            count = posts.filter(
              (p) => p.due && fmt.format(p.due) === k,
            ).length;
          return (
            <button
              type="button"
              key={k}
              aria-pressed={day === k}
              onClick={() => select(day === k ? "" : k)}
            >
              {d}
              {count > 0 && <b>{count}</b>}
            </button>
          );
        })}
      </div>
      <div className="section-title space">
        <h2>{day ? "Posts for " + day : "Upcoming posts"}</h2>
        <small>{w.org.timezone}</small>
      </div>
      <PostList
        w={w}
        posts={posts
          .filter((p) => !day || (p.due && fmt.format(p.due) === day))
          .sort((a, b) => (a.due || 0) - (b.due || 0))}
        empty="No scheduled posts"
      />
    </>
  );
}
