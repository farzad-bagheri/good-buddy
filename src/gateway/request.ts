export class Request {
  public constructor(private baseUrl: string) {}

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
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
      signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status})`);
    }

    return response;
  }
}
