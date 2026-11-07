import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./primitives.tsx";
import { request, message } from "./api.ts";

export function AccountEntry({
  path,
  error,
  refresh,
}: {
  path: string;
  error: string;
  refresh: () => Promise<void>;
}) {
  const [action, token] = path.split("/");
  const join = action === "join",
    reset = action === "reset";
  const [email, setEmail] = useState(""),
    [name, setName] = useState("");
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false),
    [problem, setProblem] = useState("");
  const [notice, setNotice] = useState(""),
    [invited, setInvited] = useState(false);
  useEffect(() => {
    let active = true;
    setInvited(false);
    setProblem("");
    setPassword("");
    setConfirmation("");
    if (join) {
      request<{ email: string }>("/api/invitations/check", { token })
        .then((result) => {
          if (active) {
            setEmail(result.email);
            setInvited(true);
          }
        })
        .catch((err) => {
          if (active) setProblem(message(err));
        });
    }
    return () => {
      active = false;
    };
  }, [join, token]);

  async function submit() {
    setProblem("");
    if ((join || reset) && password !== confirmation) {
      setProblem("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (join)
        await request("/api/invitations/accept", { token, name, password });
      else if (reset) {
        await request("/api/auth/reset-password", {
          token,
          newPassword: password,
        });
        setNotice("Password updated. Sign in with your new password.");
      } else await request("/api/auth/sign-in/email", { email, password });
      setPassword("");
      setConfirmation("");
      location.hash = "overview";
      await refresh();
    } catch (err) {
      setProblem(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="entry">
      <Brand />
      <main className="entry-layout">
        <div className="entry-panel">
          <p className="overline">Private workspace</p>
          <h1>
            {join
              ? "Join your team"
              : reset
                ? "Choose a new password"
                : "Editorial sign-in"}
          </h1>
          <p>
            {join
              ? "Your invitation gives you an individual workspace account."
              : reset
                ? "This recovery link can be used once."
                : "Sign in with your invited email address and password."}
          </p>
          {notice && <p role="status">{notice}</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {join && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={80}
                />
              </label>
            )}
            {!reset && (
              <label>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  readOnly={join}
                  required
                />
              </label>
            )}
            <label>
              {reset ? "New password" : "Password"}
              <input
                type="password"
                autoComplete={
                  join || reset ? "new-password" : "current-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            {(join || reset) && (
              <>
                <p className="hint">
                  Use at least 12 characters. A unique passphrase works well.
                </p>
                <label>
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
              </>
            )}
            {(problem || error) && (
              <p role="alert" className="error">
                {problem || error}
              </p>
            )}
            <button
              type="submit"
              className="primary"
              disabled={busy || (join && !invited)}
            >
              {busy
                ? "Please wait…"
                : join
                  ? "Create my account"
                  : reset
                    ? "Save new password"
                    : "Sign in"}
              <ArrowUpRight size={16} />
            </button>
          </form>
          {!join && !reset && (
            <p className="hint">
              Need access or forgot your password? Ask a workspace administrator
              for a private setup or recovery link.
            </p>
          )}
          {(join || reset) && <a href="#overview">Back to sign-in</a>}
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
