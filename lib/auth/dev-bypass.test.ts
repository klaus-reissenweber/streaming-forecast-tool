import { describe, expect, it } from "vitest";
import { isDevAuthBypassActive, readDevBypassUser } from "./dev-bypass";

describe("dev auth bypass", () => {
  it("is inactive when NODE_ENV is production even with DEV_SKIP_AUTH=true", () => {
    expect(
      isDevAuthBypassActive({
        NODE_ENV: "production",
        DEV_SKIP_AUTH: "true",
        DEV_USER_ID: "00000000-0000-4000-8000-000000000001",
        DEV_USER_EMAIL: "dev@example.com",
      }),
    ).toBe(false);
    expect(
      readDevBypassUser({
        NODE_ENV: "production",
        DEV_SKIP_AUTH: "true",
        DEV_USER_ID: "00000000-0000-4000-8000-000000000001",
        DEV_USER_EMAIL: "dev@example.com",
      }),
    ).toBeNull();
  });

  it("is active only in development with DEV_SKIP_AUTH=true and user env set", () => {
    expect(
      isDevAuthBypassActive({
        NODE_ENV: "development",
        DEV_SKIP_AUTH: "true",
      }),
    ).toBe(true);
    expect(
      isDevAuthBypassActive({
        NODE_ENV: "development",
        DEV_SKIP_AUTH: "false",
      }),
    ).toBe(false);
    expect(
      readDevBypassUser({
        NODE_ENV: "development",
        DEV_SKIP_AUTH: "true",
        DEV_USER_ID: "00000000-0000-4000-8000-000000000001",
        DEV_USER_EMAIL: "dev@example.com",
      }),
    ).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      email: "dev@example.com",
    });
  });
});
