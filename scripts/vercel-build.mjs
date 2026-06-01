import { access } from "node:fs/promises";
import path from "node:path";

const publicDir = path.resolve("public");
const indexFile = path.join(publicDir, "index.html");

await access(indexFile);
console.log(`Static survey files ready: ${publicDir}`);
