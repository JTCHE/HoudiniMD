import type { Components } from "react-markdown";
import type { Element, Root, RootContent, Text } from "hast";

function tableHeading(node: Element | undefined): string {
  function textContent(child: Element | Root | RootContent): string {
    if (child.type === "text") return child.value;
    if (!("children" in child)) return "";
    return child.children.map((item) => textContent(item)).join("");
  }

  return node ? textContent(node).trim() : "";
}

/**
 * GFM table rendering. The visual rule — row lines only, no rule after the
 * last row, edge-to-edge via the wrap's negative margin against the cells'
 * own inset — is the `.md-table` component in globals.css, shared with the
 * VEX arguments table so the two can't drift apart.
 */
export const Table: Components["table"] = ({ children, node }) => (
  <div className="not-prose md-table-wrap">
    <table className={`md-table ${/^TypeDeclaration(?:Description)?/.test(tableHeading(node)) ? "md-table-declarations" : ""}`}>
      {children}
    </table>
  </div>
);

export const Th: Components["th"] = ({ children }) => <th>{children}</th>;

export const Td: Components["td"] = ({ children }) => <td>{children}</td>;
