import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.LLM_DUMP_PORT || 8790);
const ROOT_DIR = process.env.LLM_DUMP_DIR || path.join(process.cwd(), ".local", "llm-dumps");

function safeFilePart(value) {
  return String(value || "")
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
}

async function writeDump(payload) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const ts = now.toISOString().replaceAll(":", "-");

  const kind = safeFilePart(payload?.kind || "llm");
  const callId = safeFilePart(payload?.callId || payload?.id || "unknown");
  const model = safeFilePart(payload?.model || "unknown");

  const dir = path.join(ROOT_DIR, day);
  await fs.mkdir(dir, { recursive: true });

  const fileName = `${ts}_${kind}_${model}_${callId}.json`;
  const filePath = path.join(dir, fileName);

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

function readJsonBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw.length ? JSON.parse(raw) : null);
      } catch (err) {
        reject(Object.assign(err, { statusCode: 400 }));
      }
    });

    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rootDir: ROOT_DIR }));
    return;
  }

  if (req.method !== "POST" || (req.url !== "/dump" && req.url !== "/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const filePath = await writeDump(payload);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, filePath }));
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err?.message || "Failed to write dump" }));
  }
});

server.listen(PORT, () => {
  console.log(`[llm-dump] listening on http://127.0.0.1:${PORT}`);
  console.log(`[llm-dump] POST http://127.0.0.1:${PORT}/dump -> ${ROOT_DIR}`);
});

