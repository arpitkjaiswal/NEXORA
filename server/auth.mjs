import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export async function createAuth(password, { production = false } = {}) {
  if (production && (!password || password.length < 12))
    throw new Error(
      "Set NEXORA_AUTH_PASSWORD to at least 12 characters before starting in production.",
    );
  const salt = randomBytes(16);
  const expected = password ? await derive(password, salt, 32) : null;
  const sessions = new Map();
  const attempts = new Map();
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const tokenFrom = (req) =>
    /(?:^|;\s*)nexora_session=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    )?.[1];
  const authenticated = (req) => {
    if (!expected) return true;
    const token = tokenFrom(req);
    const key = token && hash(token);
    const expires = key && sessions.get(key);
    if (!expires || expires < Date.now()) {
      if (key) sessions.delete(key);
      return false;
    }
    return true;
  };
  const cookie = (value, age) =>
    `nexora_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? "; Secure" : ""}`;
  return {
    required: Boolean(expected),
    authenticated,
    async login(req, supplied) {
      const address = req.socket.remoteAddress || "unknown";
      const now = Date.now();
      for (const [key, attempt] of attempts)
        if (attempt.expires < now) attempts.delete(key);
      const attempt = attempts.get(address) || {
        count: 0,
        expires: now + 60_000,
      };
      if (attempt.count >= 10)
        throw Object.assign(
          new Error("Too many sign-in attempts. Try again in a minute."),
          { status: 429 },
        );
      attempt.count++;
      attempts.set(address, attempt);
      if (!expected || typeof supplied !== "string" || supplied.length > 1024)
        throw Object.assign(new Error("Invalid workspace password."), {
          status: 401,
        });
      const actual = await derive(supplied, salt, 32);
      if (!timingSafeEqual(actual, expected))
        throw Object.assign(new Error("Invalid workspace password."), {
          status: 401,
        });
      attempts.delete(address);
      for (const [key, expires] of sessions)
        if (expires < now) sessions.delete(key);
      if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString("hex");
      sessions.set(hash(token), now + 86400000);
      return cookie(token, 86400);
    },
    logout(req) {
      const token = tokenFrom(req);
      if (token) sessions.delete(hash(token));
      return cookie("", 0);
    },
  };
}
