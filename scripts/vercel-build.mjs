import { mkdir, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";

const out = "dist";
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of ["index.html", "assets", "icons", "favicon.svg", "data"]) {
  if (existsSync(name)) {
    await cp(name, `${out}/${name}`, { recursive: true });
  }
}

console.log("Vercel static files copied to dist/");
