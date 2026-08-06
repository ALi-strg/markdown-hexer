import { describe, it, expect, vi, afterEach } from "vitest";
import { debounce } from "../debounce";

describe("debounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers invocation until the wait window elapses", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancels-and-delays on rapid input so only the last burst fires", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    vi.advanceTimersByTime(150);
    debounced();
    vi.advanceTimersByTime(150);
    debounced();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires again for a new burst after the window elapsed", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    vi.advanceTimersByTime(200);
    debounced();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("passes through the latest arguments", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced("a");
    debounced("b");
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("cancel() drops a pending invocation", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
