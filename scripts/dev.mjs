import { spawn } from "node:child_process";
import { watch } from "node:fs";
import net from "node:net";

await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", () =>
    reject(
      new Error(
        "The API port is already in use. Reuse the existing NEXORA server or stop it first.",
      ),
    ),
  );
  probe.listen(Number(process.env.PORT || 3001), "127.0.0.1", () =>
    probe.close(resolve),
  );
});
const detached = process.platform !== "win32";
let closing = false,
  restarting = false,
  restartTimer;
function stop(child) {
  try {
    if (detached) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    /* Already stopped. */
  }
}
function launch(args) {
  const child = spawn(process.execPath, args, { stdio: "inherit", detached });
  child.on("error", (error) => {
    console.error(error.message);
    close(1);
  });
  return child;
}
let api = launch(["--env-file-if-exists=.env", "server/index.mjs"]);
const client = launch([
  "node_modules/vite/bin/vite.js",
  ...process.argv.slice(2),
]);
function observeApi(child) {
  child.on("exit", (code) => {
    if (!closing && !restarting) close(code ?? 1);
  });
}
observeApi(api);
client.on("exit", (code) => {
  if (!closing) close(code ?? 1);
});
const watcher = watch("server", (_event, name) => {
  if (!name?.endsWith(".mjs") || closing || restarting) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (closing) return;
    restarting = true;
    api.once("exit", () => {
      if (closing) return;
      api = launch(["--env-file-if-exists=.env", "server/index.mjs"]);
      observeApi(api);
      restarting = false;
    });
    stop(api);
  }, 250);
});
function close(code = 0) {
  if (closing) return;
  closing = true;
  clearTimeout(restartTimer);
  watcher.close();
  stop(api);
  stop(client);
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => close());
