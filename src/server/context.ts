import type { Env } from "./_core/env";
import type { User } from "../drizzle/schema";
import { setEnv } from "./_core/env";
import { setDbEnv } from "./db";
import { authenticateRequest } from "./sdk";

export type TrpcContext = {
  req: Request;
  env: Env;
  user: User | null;
  setHeader: (name: string, value: string) => void;
};

export async function createContext(
  env: Env,
  opts: { req: Request },
  c?: { header: (name: string, value: string) => void }
): Promise<TrpcContext> {
  setEnv(env);
  setDbEnv(env);
  let user: User | null = null;
  try {
    user = await authenticateRequest(opts.req, env);
  } catch {
    user = null;
  }
  return {
    req: opts.req,
    env,
    user,
    setHeader: (name, value) => { c?.header(name, value); },
  };
}
