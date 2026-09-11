import { FileQuestion } from "lucide-react";
import { useNavigate } from "react-router";
import { useTrail } from "@/lib/nav";
import DocLink from "./DocLink";
import DocStatusBox from "./DocStatusBox";

/**
 * Drawn by the reading view when the install holds no such page. The suggestion
 * list the site shows needs a search index, so it arrives with the FTS5 index.
 * See spec: Local — SQLite FTS5 Index.
 *
 * A reader who followed a link here wants the page they came from, so the way
 * out is "back" while there is a page behind this one, and "home" only when
 * this is the first page of the trail.
 */
export default function NotFoundPage({ path }: { path: string }) {
  const navigate = useNavigate();
  const { canGoBack } = useTrail();
  return (
    <DocStatusBox
      icon={FileQuestion}
      path={path}
      title="This page does not exist in the selected Houdini build"
    >
      {canGoBack ? (
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="cursor-interactive text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Go back
        </button>
      ) : (
        <DocLink
          href="/"
          className="text-xs text-muted-foreground"
        >
          Go home
        </DocLink>
      )}
    </DocStatusBox>
  );
}
