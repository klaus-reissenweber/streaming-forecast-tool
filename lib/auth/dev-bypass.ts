type BypassEnv = {
  NODE_ENV?: string;
  DEV_SKIP_AUTH?: string;
  DEV_USER_ID?: string;
  DEV_USER_EMAIL?: string;
};

/**
 * Local-only auth bypass. The NODE_ENV check is first so a production
 * build drops this branch even when DEV_SKIP_AUTH is set.
 */
export function isDevAuthBypassActive(
  env: BypassEnv = process.env,
): boolean {
  if (env.NODE_ENV !== "development") {
    return false;
  }
  return env.DEV_SKIP_AUTH === "true";
}

export function readDevBypassUser(
  env: BypassEnv = process.env,
): { id: string; email: string } | null {
  if (!isDevAuthBypassActive(env)) {
    return null;
  }
  const id = env.DEV_USER_ID?.trim() ?? "";
  const email = env.DEV_USER_EMAIL?.trim() ?? "";
  if (!id || !email) {
    return null;
  }
  return { id, email };
}
