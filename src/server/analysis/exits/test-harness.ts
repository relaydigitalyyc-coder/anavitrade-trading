/**
 * Minimal, dependency-free test harness for the exits module.
 *
 * The Worker tsconfig loads only `@cloudflare/workers-types`, so `node:test` /
 * `node:assert` are not type-resolvable here. This harness uses nothing but the
 * `console` global, so it typechecks under `pnpm check` AND runs under `tsx`.
 * On any failure `report()` throws, giving a non-zero exit for CI.
 */

type TestFn = () => void;

const failures: string[] = [];
let passed = 0;

export function test(name: string, fn: TestFn): void {
  try {
    fn();
    passed += 1;
    console.log(`ok   - ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(name);
    console.log(`FAIL - ${name}\n       ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${msg ?? "assertEqual"}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

export function assertOk(condition: boolean, msg?: string): void {
  if (!condition) {
    throw new Error(msg ?? "assertOk: condition was false");
  }
}

export function assertClose(
  actual: number,
  expected: number,
  msg?: string,
  eps = 1e-9,
): void {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(
      `${msg ?? "assertClose"}: expected ≈${expected}, got ${actual}`,
    );
  }
}

export function report(): void {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    throw new Error(`${failures.length} test(s) failed: ${failures.join(", ")}`);
  }
}
