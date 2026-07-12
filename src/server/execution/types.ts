import type { cexConnections } from "../../drizzle/schema";

export type CexConnectionRow = typeof cexConnections.$inferSelect;
