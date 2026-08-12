import type { Components } from "react-markdown";

/**
 * GFM table rendering. The visual rule — row lines only, no rule after the
 * last row, edge-to-edge via the wrap's negative margin against the cells'
 * own inset — is the `.md-table` component in globals.css, shared with the
 * VEX arguments table so the two can't drift apart.
 */
export const Table: Components["table"] = ({ children }) => (
  <div className="not-prose md-table-wrap">
    <table className="md-table">{children}</table>
  </div>
);

export const Th: Components["th"] = ({ children }) => <th>{children}</th>;

export const Td: Components["td"] = ({ children }) => <td>{children}</td>;
