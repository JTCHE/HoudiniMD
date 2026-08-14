import type { Instrumentation } from "next";

// Production strips the error message before it reaches component-level
// `console.error` logs. This hook runs earlier, with the real message and
// digest still attached, so it is the only source of the actual failure
// reason (e.g. `DYNAMIC_SERVER_USAGE`) for docs page 500s.
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  const error = err as { message?: string; digest?: string };
  console.error("onRequestError", {
    message: error.message,
    digest: error.digest,
    path: request.path,
  });
};
