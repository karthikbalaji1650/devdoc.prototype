import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedSaver } from './autosave';

describe('debounced saver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not save until the delay has passed', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 400);
    s.schedule('a');
    vi.advanceTimersByTime(399);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledWith('a');
  });

  it('collapses a burst of changes into one save of the latest value', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 400);
    for (const v of ['a', 'b', 'c', 'd']) { s.schedule(v); vi.advanceTimersByTime(100); }
    vi.advanceTimersByTime(400);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('d');
  });

  it('keeps waiting while changes keep arriving', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 400);
    for (let i = 0; i < 10; i++) { s.schedule(i); vi.advanceTimersByTime(300); }
    expect(save).not.toHaveBeenCalled();
  });

  it('flush saves the waiting value immediately, exactly once', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 400);
    s.schedule('x');
    s.flush();
    expect(save).toHaveBeenCalledWith('x');
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing waiting does nothing', () => {
    const save = vi.fn();
    createDebouncedSaver(save, 400).flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('cancel discards the waiting value', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 400);
    s.schedule('x');
    s.cancel();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    expect(s.hasPending()).toBe(false);
  });

  it('can save falsy values', () => {
    const save = vi.fn();
    const s = createDebouncedSaver<number>(save, 10);
    s.schedule(0);
    vi.advanceTimersByTime(10);
    expect(save).toHaveBeenCalledWith(0);
  });
});
