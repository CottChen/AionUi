/**
 * CLI session inspection reads host-wide Codex/OpenCode/Pi session data.
 * Desktop runs as the trusted local user; WebUI access is admin-only.
 */
export const canAccessCliSessions = (isDesktop: boolean, isAdmin: boolean | undefined): boolean =>
  isDesktop || isAdmin === true;
