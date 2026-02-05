const doc = document;

export const nodeOps = {
  insert(child: Node, parent: Node, anchor: Node | null = null) {
    parent.insertBefore(child, anchor);
  },
  createElement(tag: string): Element {
    return doc.createElement(tag);
  },
  setElementText(el: Element, text: string) {
    el.textContent = text;
  },
  remove(child: Node) {
    const parent = child.parentNode;
    if (parent) {
      parent.removeChild(child);
    }
  },
};
