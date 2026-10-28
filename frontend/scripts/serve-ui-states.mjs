import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(".ui-state-harness");
const types = { ".css": "text/css", ".js": "text/javascript" };
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!["index.html", "bundle.js", "bundle.css"].includes(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    const body = readFileSync(resolve(directory, file));
    response.writeHead(200, {
      "Content-Type": types[file.slice(file.lastIndexOf("."))] ?? "text/html",
    });
    response.end(body);
  } catch {
    response.writeHead(500);
    response.end("UI story build unavailable");
  }
});
server.listen(3107, "127.0.0.1", () => {
  console.log("NEXUS UI component harness ready at http://127.0.0.1:3107");
});
