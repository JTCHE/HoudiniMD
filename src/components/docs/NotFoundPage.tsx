import { FileQuestion } from "lucide-react";
import DocLink from "./DocLink";
import DocStatusBox from "./DocStatusBox";

/**
 * Drawn by the reading view when the install holds no such page. The suggestion
 * list the site shows needs a search index, so it arrives with the FTS5 index.
 * See spec: Local — SQLite FTS5 Index.
 */
export default function NotFoundPage({ path }: { path: string }) {
  return (
    <DocStatusBox
      icon={FileQuestion}
      path={path}
      title="This page does not exist in the selected Houdini build"
    >
      <DocLink
        href="/"
        className="text-xs text-muted-foreground"
      >
        Go home
      </DocLink>
    </DocStatusBox>
  );
}
