export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The analysis server is unavailable. Start the app with npm run dev.",
    );
  }
  if (response.status === 401)
    window.dispatchEvent(new Event("nexora:unauthorized"));
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status}).`);
  return body as T;
}
