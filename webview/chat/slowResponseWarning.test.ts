import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThinkingIndicator } from "./components/ThinkingIndicator";
import { createSlowResponseWarning } from "./slowResponseWarning";

afterEach(() => {
  vi.useRealTimers();
});

describe("slow response warning", () => {
  it("shows guidance only after 30 seconds and clears it when stopped", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const warning = createSlowResponseWarning(onChange);
    warning.start();
    vi.advanceTimersByTime(29_999);
    expect(onChange).not.toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenLastCalledWith(true);
    warning.stop();
    expect(onChange).toHaveBeenLastCalledWith(false);

    const html = renderToStaticMarkup(
      createElement(ThinkingIndicator, { slowResponse: true }),
    );
    expect(html).toContain("enough RAM");
    expect(html).toContain("configured correctly");
    expect(html).toContain("first run");
    expect(renderToStaticMarkup(
      createElement(ThinkingIndicator, { slowResponse: false }),
    )).not.toContain("enough RAM");
  });

  it("does not warn after a request stops and resets the delay for a new request", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const warning = createSlowResponseWarning(onChange);
    warning.start();
    vi.advanceTimersByTime(20_000);
    warning.stop();
    vi.advanceTimersByTime(30_000);
    expect(onChange).not.toHaveBeenCalledWith(true);

    warning.start();
    vi.advanceTimersByTime(20_000);
    warning.start();
    vi.advanceTimersByTime(20_000);
    expect(onChange).not.toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(10_000);
    expect(onChange).toHaveBeenLastCalledWith(true);
    warning.stop();
  });
});
