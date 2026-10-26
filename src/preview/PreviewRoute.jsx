import { lazy, Suspense } from "react";

// Branch before importing App.jsx: its module graph initializes the production
// client and access hooks. Global POS CSS is also confined to the original path.
const PosApplication = lazy(() =>
  /^\/pos\/preview\/?$/.test(window.location.pathname)
    ? import("./PreviewApp.jsx")
    : Promise.all([import("../index.css"), import("../app/App.jsx")]).then(
        ([, app]) => app,
      ),
);

export default function PreviewRoute() {
  return (
    <Suspense
      fallback={
        <div role="status" style={{ padding: 32, fontFamily: "system-ui" }}>
          Loading POS…
        </div>
      }
    >
      <PosApplication />
    </Suspense>
  );
}
