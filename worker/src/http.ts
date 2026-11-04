export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, { status });
}

/**
 * A request's JSON body, or the 413 refusing one longer than maxLength
 * (string length - close enough to bytes for a ceiling). A body that isn't
 * JSON comes back as undefined, for the caller to refuse in its own words.
 */
export async function readJsonBody(request: Request, maxLength: number, tooBigMessage: string): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxLength) {
    return errorResponse(413, tooBigMessage);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
