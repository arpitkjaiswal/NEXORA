import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/session/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      onLogin();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          <span>
            NEXORA<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="login-symbol">
          <LockKeyhole size={27} />
        </div>
        <div className="eyebrow">YOUR ENGINEERING WORKSPACE</div>
        <h1>A clearer view starts here.</h1>
        <p>
          Sign in to explore your code, connections, and next big improvement.
        </p>
        <form onSubmit={submit}>
          <label className="input-label" htmlFor="workspace-password">
            Workspace password
          </label>
          <div className="input-wrap">
            <LockKeyhole size={16} />
            <input
              id="workspace-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
              disabled={loading}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary full-width"
            type="submit"
            disabled={loading}
          >
            {loading ? <LoaderCircle size={15} className="spin" /> : null}Sign
            in <ArrowRight size={15} />
          </button>
        </form>
        <span className="login-note">
          <ShieldCheck size={14} />
          Your code. Your private workspace.
        </span>
      </div>
    </div>
  );
}
