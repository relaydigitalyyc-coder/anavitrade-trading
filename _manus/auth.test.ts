import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// Mock the db module so tests don't need a real database
vi.mock("./db", () => ({
  registerUser: vi.fn(),
  verifyUserPassword: vi.fn(),
  verifyEmailToken: vi.fn(),
  createPasswordResetToken: vi.fn(),
  resetPassword: vi.fn(),
  getUserById: vi.fn(),
  getOrCreateLiveAccount: vi.fn(),
  getLiveAccountByUserId: vi.fn(),
  toggleKillSwitch: vi.fn(),
  updateRiskSettings: vi.fn(),
  connectApiWallet: vi.fn(),
  getApiWalletByUserId: vi.fn(),
  activateApiWallet: vi.fn(),
  revokeApiWallet: vi.fn(),
  createDemoAccount: vi.fn(),
  getDemoAccountByToken: vi.fn(),
  getDemoTradesByAccountId: vi.fn(),
  writeAuditLog: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getUserByEmail: vi.fn(),
}));

import * as db from "./db";

type CookieCall = { name: string; value: string; options: Record<string, unknown> };
type ClearCookieCall = { name: string; options: Record<string, unknown> };

function createPublicContext() {
  const cookies: CookieCall[] = [];
  const clearedCookies: ClearCookieCall[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1" } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, cookies, clearedCookies };
}

function createAuthContext(overrides?: Partial<TrpcContext["user"]>) {
  const { ctx, cookies, clearedCookies } = createPublicContext();
  ctx.user = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as NonNullable<TrpcContext["user"]>;
  return { ctx, cookies, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and returns success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });
});

describe("auth.register", () => {
  beforeEach(() => {
    vi.mocked(db.registerUser).mockResolvedValue({
      user: {
        id: 1,
        openId: "",
        email: "new@example.com",
        name: "New User",
        loginMethod: "email",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        emailVerified: false,
        passwordHash: null,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
      verificationToken: "test-token-123",
    });
    vi.mocked(db.verifyEmailToken).mockResolvedValue({
      id: 1, openId: "", email: "new@example.com", name: "New User",
      loginMethod: "email", role: "user", createdAt: new Date(),
      updatedAt: new Date(), lastSignedIn: new Date(),
      emailVerified: true, passwordHash: null,
      verificationToken: null, verificationTokenExpiresAt: null,
      resetToken: null, resetTokenExpiresAt: null,
    });
  });

  it("registers a new user and sets a session cookie", async () => {
    const { ctx, cookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.register({
      name: "New User",
      email: "new@example.com",
      password: "securepassword123",
    });
    expect(result.success).toBe(true);
    expect(result.userId).toBe(1);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
  });

  it("throws CONFLICT when email already exists", async () => {
    vi.mocked(db.registerUser).mockRejectedValue(new Error("EMAIL_EXISTS"));
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.register({ name: "Dup User", email: "dup@example.com", password: "password123" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("auth.login", () => {
  it("sets session cookie on valid credentials", async () => {
    vi.mocked(db.verifyUserPassword).mockResolvedValue({
      id: 2, openId: "", email: "user@example.com", name: "User",
      loginMethod: "email", role: "user", createdAt: new Date(),
      updatedAt: new Date(), lastSignedIn: new Date(),
      emailVerified: true, passwordHash: "hashed",
      verificationToken: null, verificationTokenExpiresAt: null,
      resetToken: null, resetTokenExpiresAt: null,
    });
    const { ctx, cookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({ email: "user@example.com", password: "password123" });
    expect(result.success).toBe(true);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
  });

  it("throws UNAUTHORIZED on invalid credentials", async () => {
    vi.mocked(db.verifyUserPassword).mockResolvedValue(null);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ email: "bad@example.com", password: "wrongpass" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("auth.forgotPassword", () => {
  it("always returns success regardless of email existence", async () => {
    vi.mocked(db.createPasswordResetToken).mockResolvedValue(null);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.forgotPassword({ email: "anyone@example.com" });
    expect(result.success).toBe(true);
  });
});

describe("liveAccount.toggleKillSwitch", () => {
  it("activates kill switch and returns updated state", async () => {
    vi.mocked(db.toggleKillSwitch).mockResolvedValue(undefined);
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.liveAccount.toggleKillSwitch({ active: true });
    expect(result.success).toBe(true);
    expect(result.killSwitchActive).toBe(true);
    expect(db.toggleKillSwitch).toHaveBeenCalledWith(1, true);
  });

  it("deactivates kill switch", async () => {
    vi.mocked(db.toggleKillSwitch).mockResolvedValue(undefined);
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.liveAccount.toggleKillSwitch({ active: false });
    expect(result.killSwitchActive).toBe(false);
  });
});

describe("apiWallet.revoke", () => {
  it("revokes the active API wallet", async () => {
    vi.mocked(db.revokeApiWallet).mockResolvedValue(undefined);
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.apiWallet.revoke();
    expect(result.success).toBe(true);
    expect(db.revokeApiWallet).toHaveBeenCalledWith(1, "user");
  });
});

describe("demo.create", () => {
  it("creates a demo account and returns an access token", async () => {
    vi.mocked(db.createDemoAccount).mockResolvedValue({ accessToken: "demo-token-abc123" });
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.demo.create({ startingCapital: 50000 });
    expect(result.accessToken).toBe("demo-token-abc123");
  });

  it("rejects unauthenticated demo account creation", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.demo.create({ startingCapital: 50000 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("demo.getByToken", () => {
  it("returns the demo account for a valid token", async () => {
    const mockAccount = {
      id: 1, username: "testuser", email: "demo@example.com",
      startingCapital: "50000", currentBalance: "50000",
      accessToken: "valid-token", status: "active",
      createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(db.getDemoAccountByToken).mockResolvedValue(mockAccount);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.demo.getByToken({ token: "valid-token" });
    expect(result.username).toBe("testuser");
    expect(result.startingCapital).toBe("50000");
  });

  it("throws NOT_FOUND for an invalid token", async () => {
    vi.mocked(db.getDemoAccountByToken).mockResolvedValue(null);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.demo.getByToken({ token: "bad-token" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
