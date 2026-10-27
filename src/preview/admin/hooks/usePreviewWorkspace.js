import { createContext, useContext } from "react";

export const WorkspaceContext = createContext(null);

export function usePreviewWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context)
    throw new Error(
      "Preview screens must be inside the mock workspace provider.",
    );
  return context;
}
