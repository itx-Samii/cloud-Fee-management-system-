/**
 * Full page load to an internal page, used after login, logout and forced re-login.
 * A client-side router.push would keep the previous user's state (sidebar, cached lists)
 * in memory, so these moments deliberately start the app fresh.
 */
export function reloadTo(path: string) {
  window.location.assign(path);
}
