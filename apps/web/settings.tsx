import { useState } from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import { platforms, names, type Role } from "../../packages/shared/model.ts";
import type { PageProps } from "./composer.tsx";
import { Network } from "./primitives.tsx";
import { request, message } from "./api.ts";
export function Settings({ w, refresh, notify }: PageProps) {
  const [name, setName] = useState(w.org.name),
    [zone, setZone] = useState(w.org.timezone),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<Role>("designer"),
    [busy, lock] = useState(false),
    [error, report] = useState("");
  const admin = w.user.role === "administrator";
  async function mutate(path: string, body: unknown) {
    report("");
    lock(true);
    try {
      await request("/api/" + path, body);
      await refresh();
      notify("Settings updated.");
    } catch (err) {
      report(message(err));
    } finally {
      lock(false);
    }
  }
  return (
    <>
      <header className="page-head">
        <div>
          <p className="overline">Organization</p>
          <h1>Settings</h1>
        </div>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="settings">
        <div className="policy-links">
          <a href="/privacy.html">Workspace privacy</a> ·{" "}
          <a href="/terms.html">Workspace terms</a>
        </div>
        <section>
          <h2>Workspace</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutate("settings", { name, timezone: zone });
            }}
          >
            <label>
              Organization name
              <input
                disabled={!admin}
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Display timezone
              <input
                disabled={!admin}
                value={zone}
                required
                onChange={(e) => setZone(e.target.value)}
              />
            </label>
            {admin && (
              <button type="submit" className="secondary" disabled={busy}>
                Save changes
              </button>
            )}
          </form>
        </section>
        <section>
          <h2>Publishing connections</h2>
          <p className="muted">
            {w.configured
              ? "Sync channels from the configured organization."
              : "Buffer is unavailable. Set the server API key, organization ID and media origin to enable publishing."}
          </p>
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
          {admin && (
            <button
              type="button"
              className="secondary"
              disabled={!w.configured || busy}
              onClick={() => void mutate("channels/sync", {})}
            >
              <RefreshCw size={14} />
              Sync channels
            </button>
          )}
        </section>
        {admin && (
          <section>
            <h2>Team access</h2>
            <p className="muted">
              Allow members here and include their emails in your Cloudflare
              Access policy.
            </p>
            {w.members.map((m) => (
              <div key={m.email} className="member">
                <div>
                  <strong>{m.email}</strong>
                  <small>{m.role}</small>
                </div>
                {m.email !== w.user.email && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void mutate("members", { ...m, active: false })
                    }
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate("members", { email, role });
              }}
            >
              <label>
                Member email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="designer">Designer</option>
                  <option value="administrator">Administrator</option>
                </select>
              </label>
              <button type="submit" className="secondary" disabled={busy}>
                <UserPlus size={15} />
                Grant access
              </button>
            </form>
          </section>
        )}
      </div>
    </>
  );
}
