/** Game controls live for a single route. Keep frame updates independent of the menu geometry. */
export function gameElements(root: HTMLElement) {
  const cache = new Map<string, HTMLElement>();
  return function element<T extends HTMLElement>(selector: string): T {
    let node = cache.get(selector);
    if (!node) {
      node = root.querySelector<HTMLElement>(selector) ?? undefined;
      if (!node) throw new Error(`Missing game element: ${selector}`);
      cache.set(selector, node);
    }
    return node as T;
  };
}
