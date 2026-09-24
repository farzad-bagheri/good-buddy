// Defensive: some models emit <think>...</think> reasoning even when not requested.
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trimStart();
}

/**
 * Describes a JSON parse error by providing a preview of the response and the error message.
 * @param response The JSON response string that failed to parse.
 * @param error The error thrown during parsing.
 * @returns A string describing the parse error and a preview of the response.
 */
function describeParseError(response: string, error: unknown): string {
  const preview = response.replace(/\s+/g, " ").slice(0, 300); // Take the first 300 characters of the response for preview.
  const reason = error instanceof Error ? error.message : String(error);
  return `${reason}. Response begins: ${JSON.stringify(preview)}`;
}

export function parseJsonResponse<T>(response: string, endpoint: string): T {
  try {
    return JSON.parse(response) as T;
  } catch (error) {
    throw new Error(
      `Invalid JSON response from ${endpoint}: ${describeParseError(response, error)}`,
    );
  }
}

/**
 * Processes a single line of a streaming JSON response, extracting text and invoking a callback for each chunk.
 * @param line A line of the streaming response to process.
 * @param extractText A function that extracts text from the parsed JSON object.
 * @param onChunk A callback function invoked with each extracted text chunk.
 * @returns The extracted text from the current line.
 */
export function processStreamLine(
  line: string,
  extractText: (json: unknown) => string,
  onChunk: (text: string) => void,
): string {
  try {
    const text = extractText(JSON.parse(line));
    if (text) {
      onChunk(text);
    }
    return text;
  } catch (error) {
    throw new Error(
      `Invalid streaming response from: ${describeParseError(line, error)}`,
    );
  }
}
