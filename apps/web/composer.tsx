import { useEffect, useState, useRef } from "react";
import {
  ImagePlus,
  Upload,
  Check,
  Plus,
  Eye,
  ArrowUpRight,
  Save,
  Image as ImageIcon,
} from "lucide-react";
import {
  platforms,
  maximumImageBytes,
  names,
  validateSubmission,
  type Platform,
  type Post,
  type Workspace,
  type Variants,
} from "../../packages/shared/model.ts";
import { Network, Avatar } from "./primitives.tsx";
import { request, upload, go, message } from "./api.ts";
export type PageProps = {
  w: Workspace;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
};
type Draft = {
  id: string;
  revision?: number;
  caption: string;
  variants: Variants;
  media_id: string | null;
};
export function Composer({
  w,
  refresh,
  notify,
  post,
}: { post?: Post } & PageProps) {
  const storage = "folio:" + w.user.email + ":" + (post?.id || "new");
  const [form, set] = useState<Draft>(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(storage) || "null");
      if (cached && cached.revision === post?.revision) return cached;
    } catch {}
    return post
      ? {
          id: post.id,
          revision: post.revision,
          media_id: post.media_id,
          caption: post.caption,
          variants: post.variants,
        }
      : { id: crypto.randomUUID(), media_id: null, caption: "", variants: {} };
  });
  const [tab, select] = useState<Platform>("linkedin"),
    [editor, edit] = useState<Platform | "shared">("shared"),
    [busy, lock] = useState(false),
    [error, report] = useState(""),
    [blob, preview] = useState(""),
    [over, drag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    sessionStorage.setItem(storage, JSON.stringify(form));
  }, [form, storage]);
  useEffect(
    () => () => {
      if (blob) URL.revokeObjectURL(blob);
    },
    [blob],
  );
  const img = blob || (form.media_id ? "/api/media/" + form.media_id : "");
  const active = platforms.filter((p) => p in form.variants);
  async function choose(f?: File) {
    if (!f || busy) return;
    report("");
    if (
      !["image/png", "image/jpeg"].includes(f.type) ||
      f.size > maximumImageBytes
    ) {
      report("Choose a PNG or JPEG up to 1 MB.");
      return;
    }
    lock(true);
    preview(URL.createObjectURL(f));
    try {
      const id = await upload(f);
      set((old) => ({ ...old, media_id: id }));
      await refresh();
    } catch (err) {
      report(message(err));
    } finally {
      preview("");
      lock(false);
    }
  }
  function toggle(p: Platform) {
    const variants = { ...form.variants };
    if (p in variants) {
      delete variants[p];
      if (editor === p) edit("shared");
    } else {
      variants[p] = "";
      select(p);
    }
    set({ ...form, variants });
  }
  async function save(submit: boolean) {
    if (busy) return;
    report("");
    lock(true);
    try {
      if (submit) {
        const problem = validateSubmission(
          form.caption,
          form.variants,
          w.media.find((m) => m.id === form.media_id) || null,
        );
        if (problem) throw new Error(problem);
      }
      const saved = await request<{ id: string; revision: number }>(
        "/api/posts",
        form,
      );
      const updated = { ...form, ...saved };
      set(updated);
      if (submit)
        await request("/api/posts/" + saved.id + "/action", {
          action: "submit",
          revision: saved.revision,
        });
      await refresh();
      sessionStorage.removeItem(storage);
      notify(submit ? "Submitted for approval." : "Draft saved.");
      go("post/" + saved.id);
    } catch (err) {
      report(message(err));
    } finally {
      lock(false);
    }
  }
  const text = editor === "shared" ? form.caption : form.variants[editor] || "";
  return (
    <>
      <header className="page-head">
        <div>
          <p className="overline">Composer</p>
          <h1>{post ? "Edit draft" : "Create post"}</h1>
          <p>Prepare a graphic and caption for editorial review.</p>
        </div>
      </header>
      <div className="composer-grid">
        <div className="form-sheet">
          <section>
            <h2>Graphic</h2>
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png"
              aria-label="Upload graphic"
              className="sr-only"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={busy}
              className={"drop " + (over ? "over" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                drag(true);
              }}
              onDragLeave={() => drag(false)}
              onDrop={(e) => {
                e.preventDefault();
                drag(false);
                void choose(e.dataTransfer.files[0]);
              }}
              onClick={() => file.current?.click()}
            >
              {img ? (
                <>
                  <img src={img} alt="Selected graphic" />
                  <span>
                    <Upload size={14} /> Replace graphic
                  </span>
                </>
              ) : (
                <>
                  <ImagePlus size={30} strokeWidth={1.3} />
                  <strong>Choose a graphic or drop it here</strong>
                  <small>PNG or JPEG · Up to 1 MB</small>
                </>
              )}
            </button>
            {w.media.length > 0 && (
              <label className="library-pick">
                From your library
                <select
                  disabled={busy}
                  value={form.media_id || ""}
                  onChange={(e) =>
                    set({ ...form, media_id: e.target.value || null })
                  }
                >
                  <option value="">Select a graphic</option>
                  {w.media.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
          <section>
            <h2>Platforms</h2>
            <div className="choices">
              {platforms.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={p in form.variants ? "chosen" : ""}
                  aria-pressed={p in form.variants}
                  onClick={() => toggle(p)}
                >
                  <Network p={p} />
                  {names[p]}
                  {p in form.variants ? (
                    <Check size={13} />
                  ) : (
                    <Plus size={13} />
                  )}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2>
              <label htmlFor="caption">Caption</label>
            </h2>
            <div className="tabs">
              <button
                type="button"
                className={editor === "shared" ? "active" : ""}
                onClick={() => edit("shared")}
              >
                Shared
              </button>
              {active.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={editor === p ? "active" : ""}
                  onClick={() => {
                    edit(p);
                    select(p);
                  }}
                >
                  {names[p]}
                </button>
              ))}
            </div>
            <textarea
              id="caption"
              rows={6}
              value={text}
              placeholder={
                editor === "shared"
                  ? "Write your caption…"
                  : "Leave blank to use the shared caption."
              }
              maxLength={8000}
              onChange={(e) =>
                set(
                  editor === "shared"
                    ? { ...form, caption: e.target.value }
                    : {
                        ...form,
                        variants: {
                          ...form.variants,
                          [editor]: e.target.value,
                        },
                      },
                )
              }
            />
            <small>{text.length.toLocaleString()} characters</small>
          </section>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void save(false)}
            >
              <Save size={15} />
              Save draft
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Submit for approval
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <aside className="preview">
          <div className="section-title">
            <h2>Post preview</h2>
            <Eye size={17} />
          </div>
          <div className="tabs">
            {platforms.map((p) => (
              <button
                type="button"
                key={p}
                className={p === tab ? "active" : ""}
                onClick={() => select(p)}
              >
                {names[p]}
              </button>
            ))}
          </div>
          <div className="social-preview">
            <div className="social-head">
              <Avatar />
              <div>
                <strong>
                  {w.channels.find((c) => c.platform === tab)?.name ||
                    w.org.name}
                </strong>
                <small>{names[tab]} preview</small>
              </div>
              <Network p={tab} />
            </div>
            {tab !== "instagram" && (
              <p>
                {form.variants[tab] ||
                  form.caption ||
                  "Your caption will appear here."}
              </p>
            )}
            {img ? (
              <img
                className="preview-media"
                src={img}
                alt="Post graphic preview"
              />
            ) : (
              <div className="blank-graphic">
                <ImageIcon size={40} strokeWidth={1} />
              </div>
            )}
            {tab === "instagram" && (
              <p>
                {form.variants[tab] ||
                  form.caption ||
                  "Your caption will appear here."}
              </p>
            )}
          </div>
          <p className="hint">Final appearance may vary by platform.</p>
        </aside>
      </div>
    </>
  );
}
