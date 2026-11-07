import { useState } from "react";
import { Copy, RefreshCw, UserPlus } from "lucide-react";
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
    [setup, setSetup] = useState<{
      url: string;
      kind: string;
      email: string;
    } | null>(null),
    [error, report] = useState("");
  const admin = w.user.role === "administrator";
  const workspaceUrl = new URL("/", window.location.origin).href;
  async function copyWorkspaceUrl() {
    try {
      await navigator.clipboard.writeText(workspaceUrl);
      notify("Workspace link copied.");
    } catch {
      notify("Select the workspace address and copy it manually.");
    }
  }
  async function mutate(path: string, body: unknown) {
    report("");
    if (path.startsWith("members")) setSetup(null);
    lock(true);
    try {
      const result = await request<{
        url?: string;
        kind?: string;
        email?: string;
      }>("/api/" + path, body);
      if (result.url)
        setSetup({
          url: result.url,
          kind: result.kind || "invitation",
          email: result.email || email,
        });
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
          {w.local ? (
            <p className="muted">
              This preview runs on your computer. The hosted workspace will have
              a link you can share with invited teammates.
            </p>
          ) : (
            <div>
              <label>
                Team workspace link
                <input
                  type="url"
                  readOnly
                  value={workspaceUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={copyWorkspaceUrl}
              >
                <Copy size={14} />
                Copy workspace link
              </button>
              <p className="hint">
                Each teammate signs in with their invited email address.
              </p>
            </div>
          )}
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
              Grant a role, then share the private invitation link with that
              teammate. Existing members can receive a recovery link.
            </p>
            {setup && (
              <div className="note">
                <label>
                  Private {setup.kind} link
                  <input
                    readOnly
                    value={setup.url}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <p className="hint">
                  Share this only with {setup.email}. Invitations expire in
                  seven days; recovery links expire in one hour.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(setup.url)
                      .then(() => notify("Private link copied."))
                      .catch(() =>
                        notify("Select the link and copy it manually."),
                      )
                  }
                >
                  Copy private link
                </button>
              </div>
            )}
            {w.members.map((m) => (
              <div key={m.email} className="member">
                <div>
                  <strong>{m.email}</strong>
                  <small>{m.role}</small>
                </div>
                {!w.local && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void mutate("members/setup-link", { email: m.email })
                    }
                  >
                    Setup / recovery link
                  </button>
                )}
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
