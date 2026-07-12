import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// Mock the db module
vi.mock("./db", () => ({
  createDemoAccount: vi.fn(),
  getDemoAccountByToken: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

import { createDemoAccount, getDemoAccountByToken } from "./db";

const mockedCreateDemoAccount = vi.mocked(createDemoAccount);
const mockedGetDemoAccountByToken = vi.mocked(getDemoAccountByToken);

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(overrides?: Partial<User>): TrpcContext {
  const user: User = {
    id: 1,
    openId: "local:1",
    name: "Test User",
    email: "test@example.com",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("demo.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a demo account for authenticated user", async () => {
    mockedCreateDemoAccount.mockResolvedValue({ accessToken: "test-token-123" });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.demo.create({ startingCapital: 50000 });

    expect(result).toEqual({ accessToken: "test-token-123" });
    expect(mockedCreateDemoAccount).toHaveBeenCalledWith({
      username: "Test User",
      email: "test@example.com",
      startingCapital: "50000",
    });
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.demo.create({ startingCapital: 50000 })
    ).rejects.toThrow();
  });

  it("rejects non-positive capital", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.demo.create({ startingCapital: -1000 })
    ).rejects.toThrow();
  });
});

describe("demo.getByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns account data for valid token", async () => {
    const mockAccount = {
      id: 1,
      username: "testuser",
      email: "test@example.com",
      startingCapital: "50000.00",
      currentBalance: "50000.00",
      status: "active" as const,
      accessToken: "valid-token",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockedGetDemoAccountByToken.mockResolvedValue(mockAccount);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.demo.getByToken({ token: "valid-token" });

    expect(result).toEqual(mockAccount);
    expect(mockedGetDemoAccountByToken).toHaveBeenCalledWith("valid-token");
  });

  it("throws error for non-existent token", async () => {
    mockedGetDemoAccountByToken.mockResolvedValue(null);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.demo.getByToken({ token: "invalid-token" })
    ).rejects.toThrow("Demo account not found");
  });

  it("rejects empty token", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.demo.getByToken({ token: "" })
    ).rejects.toThrow();
  });
});
