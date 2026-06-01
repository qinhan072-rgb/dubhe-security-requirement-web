import catchAllHandler from "./[...path].mjs";

export default function handler(req, res) {
  const url = new URL(req.url || "/api", `https://${req.headers.host || "localhost"}`);
  const routedPath = url.searchParams.get("path");

  if (routedPath) {
    url.searchParams.delete("path");
    const cleanPath = routedPath.replace(/^\/+/, "");
    const query = url.searchParams.toString();
    req.url = `/api/${cleanPath}${query ? `?${query}` : ""}`;
  }

  return catchAllHandler(req, res);
}
