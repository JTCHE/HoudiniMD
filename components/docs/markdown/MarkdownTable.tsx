import type { Components } from "react-markdown";

/** GFM table rendering: no outer frame, no column rules — only row separators. */
export const Table: Components["table"] = ({ children }) => (
  // -mx-4 against the cells' px-4: cell text sits on the page's text axis,
  // only the row rules overhang — same trick as .callout in globals.css.
  <div className="not-prose overflow-x-auto my-8 -mx-4">
    {/* ponytail: w-56 on the first column is a hint, not a lock — auto layout
        still widens it when the content genuinely needs it, so most parameter
        tables line their Description column up on the same axis without
        squashing the odd wide table. Switch to table-fixed if exact alignment
        across every table matters more than per-table fit. */}
    <table className="w-full border-collapse text-sm [&_tr:last-child_td]:border-b-0 [&_td_code]:whitespace-nowrap [&_tr>:first-child]:w-1/5">
      {children}
    </table>
  </div>
);

export const Th: Components["th"] = ({ children }) => (
  <th className="border-b border-border px-4 py-3 text-left font-medium text-muted-foreground">{children}</th>
);

export const Td: Components["td"] = ({ children }) => (
  <td className="border-b border-border px-4 py-3 align-top text-foreground">{children}</td>
);
