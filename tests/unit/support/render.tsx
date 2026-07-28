/**
 * A ~60-line React renderer for the unit lane. Hand-rolled on purpose, in the same
 * spirit as `e2e-lane-coverage.test.ts`'s hand-rolled glob matcher: everything below is
 * `react-dom/client` plus `act`, and pulling in a testing-library only to get
 * `getByTestId` over a document we already tag with `data-testid` everywhere would be a
 * dependency for sugar.
 *
 * Import this ONLY from a `.test.tsx` that carries `// @vitest-environment jsdom`.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  // React reads this to decide whether `act` is legal. Vitest does not set it.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

export interface Mounted {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

/** Mount `element` into a fresh detached-but-attached container and flush its effects. */
export async function mount(element: ReactElement): Promise<Mounted> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Query by the app's own E2E seam. Throws (never returns null) so a typo in a testid
 *  fails as a missing element rather than as a silently-skipped assertion. */
export function byTestId(root: ParentNode, testId: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`no element with data-testid="${testId}"`);
  return el;
}

/** Same, but `null` when absent — for assertions ABOUT absence. */
export function queryTestId(root: ParentNode, testId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

/** Click and flush. `element.click()` dispatches a real DOM event, which is what React's
 *  delegated listener is actually attached to, so this exercises the same path a user
 *  does — including the DISABLED short-circuit, which a direct `onClick()` call skips. */
export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

/** Set an `<input>`'s value the way React sees it (the native setter, then an `input`
 *  event), because React overrides the value property on the DOM node. */
export async function type(element: HTMLElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The `<textarea>` twin of {@link type}. It needs its OWN native setter: React tracks
 *  the value on the concrete element class, and `HTMLInputElement.prototype`'s setter
 *  called on a textarea is an illegal invocation. */
export async function typeTextArea(
  element: HTMLElement,
  value: string,
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Pick a `<select>`'s value the way React sees it: the native setter (React overrides
 *  `value` on the DOM node, exactly as it does for `<input>`) followed by a bubbling
 *  `change` event, which is what React's `onChange` is actually wired to for a select. */
export async function selectOption(element: HTMLElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * Press a key ON an element and flush. A real bubbling `KeyboardEvent`, because React's
 * `onKeyDown` is a delegated listener at the root — calling the prop directly would
 * prove nothing about the key ever reaching it, and would skip `preventDefault`
 * entirely. The returned event is the one that was dispatched, so a caller can assert
 * whether the handler claimed the key or let the browser keep it.
 */
export async function press(
  element: HTMLElement,
  key: string,
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => {
    element.dispatchEvent(event);
  });
  return event;
}

/** Flush pending microtasks + effects without advancing anything else. */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** A promise you resolve by hand — the whole point of these tests is controlling WHEN a
 *  request settles relative to another interaction. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
