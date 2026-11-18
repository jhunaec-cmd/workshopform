// Navigation helpers shared by every screen.
// Kept in their own file so screens can import them without importing main.js.

let dirtyCheck = null;

// A screen with a form calls setDirtyCheck(() => hasUnsavedEdits).
// Before leaving that screen the app asks "Leave without saving?".
export const setDirtyCheck = (fn) => {
  dirtyCheck = fn;
};

export const hasUnsavedChanges = () => Boolean(dirtyCheck && dirtyCheck());

// Go to a screen, e.g. go("#/jobs"). If we're already there, redraw it.
export const go = (hash) => {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
};
