import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(".hits-test-harness");
const server = createServer((request, response) => {
  const name = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
  if (!["index.html", "bundle.js", "bundle.css"].includes(name)) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    const body = readFileSync(resolve(directory, name));
    const type = name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html";
    response.writeHead(200, {"Content-Type": type});
    response.end(body);
  } catch {
    response.writeHead(500);
    response.end("Hits harness not available");
  }
});
server.listen(3108, "127.0.0.1", () => console.log("Hits test harness ready"));
