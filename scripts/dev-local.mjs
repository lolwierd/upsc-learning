import { spawn } from "node:child_process";
import process from "node:process";

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  return child;
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

function killProcess(child) {
  if (!child || child.killed) return;
  try {
    child.kill("SIGINT");
  } catch {
    // ignore
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldMigrate = !args.includes("--skip-migrate");

  if (shouldMigrate) {
    const migrate = run("pnpm", ["db:migrate"]);
    const res = await waitForExit(migrate);
    if (res.code !== 0) process.exit(res.code ?? 1);
  }

  const dump = run("pnpm", ["dev:dump"]);
  const dev = run("pnpm", ["dev"]);

  const shutdown = () => {
    killProcess(dev);
    killProcess(dump);
    setTimeout(() => process.exit(0), 300).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const devExit = await waitForExit(dev);
  shutdown();

  process.exit(devExit.code ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

