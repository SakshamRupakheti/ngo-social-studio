export async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const result = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(
      result.error ||
        result.message ||
        "Request failed. Sign in again or try refreshing.",
    );
  }
  return res.json() as Promise<T>;
}
export async function upload(file: File): Promise<string> {
  const res = await fetch("/api/media", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Filename": encodeURIComponent(file.name),
    },
    body: file,
  });
  const data = (await res.json()) as { error?: string; id: string };
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data.id;
}
export function go(path: string) {
  window.location.hash = path;
}
export function date(value: number, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
export function message(err: unknown) {
  return err instanceof Error
    ? err.message
    : "Something went wrong. Please try again.";
}
