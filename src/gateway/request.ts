export class Request {
  public constructor(
    private baseUrl: string,
    private headers: Record<string, string> = {},
  ) {}

  /**
   * Sends a POST request to the specified path with the given body and optional abort signal.
   * @param path The API endpoint path.
   * @param body The request body as a JSON string.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The response text.
   */
  async post(
    path: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.request("POST", path, body, signal);
  }

  /**
   * Sends a GET request to the specified path.
   * @param path The API endpoint path.
   * @returns The response text.
   */
  async get(path: string): Promise<Response> {
    return this.request("GET", path);
  }

  /**
   * Sends an HTTP request to the specified path with the given method, body, and optional abort signal.
   * @param method The HTTP method (e.g., "GET", "POST").
   * @param path The API endpoint path.
   * @param body The request body as a JSON string.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The response text.
   */
  private async request(
    method: "GET" | "POST",
    path: string,
    body?: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: {
        ...this.headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      signal,
    });

    if (!response.ok) {
      const message = `Request failed (${response.status}) for ${path}`;
      let body: string;
      try {
        body = await response.text();
      } catch (error) {
        if (signal?.aborted) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}: Could not read error response: ${reason}`, {
          cause: error,
        });
      }
      const detail = errorDetail(body);
      throw new Error(detail ? `${message}: ${detail}` : message);
    }

    return response;
  }
}

function errorDetail(body: string): string {
  let detail = body.trim();
  if (!detail) return "";
  try {
    const json: unknown = JSON.parse(detail);
    if (json && typeof json === "object" && "error" in json) {
      const error = json.error;
      if (typeof error === "string") {
        detail = error;
      } else if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        detail = error.message;
      }
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  detail = detail.replace(/\s+/g, " ").trim();
  return detail.length > 2000 ? `${detail.slice(0, 2000)}...` : detail;
}
