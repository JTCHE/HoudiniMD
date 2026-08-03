type Node = {
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

export function rehypeCards() {
  return (tree: Node) => {
    const visit = (node: Node, inCardGrid = false): void => {
      const classNames = node.properties?.className;
      const isCardGrid = Array.isArray(classNames) && classNames.includes("shelf-grid");
      if (inCardGrid && node.tagName === "li") {
        node.properties = { ...node.properties, dataCard: true };
      }
      node.children?.forEach((child) => visit(child, inCardGrid || isCardGrid));
    };
    visit(tree);
  };
}