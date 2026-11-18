/** Compare the browser origin with Host, rather than Next's internal server URL. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = request.headers.get("host") ?? new URL(request.url).host;
    return ["http:","https:"].includes(url.protocol) && url.host === host;
  } catch { return false; }
}
export function redirectUrl(path: string, request: Request) {
  if (!isSameOrigin(request)) throw new Error("Origine non valida.");
  return new URL(path, request.headers.get("origin")!);
}
