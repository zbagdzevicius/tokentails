/**
 * Typed response bodies for the mocked backend (trimmed from client/e2e/fixtures/contracts.ts: Paw Legends reads no
 * storefront).
 */
import { ErrorCode } from "@/shared-contracts/errors";

/** Error body in the F5.6 shape: `{ statusCode, code, message }`. */
export function errorBody(statusCode: number, code: ErrorCode, message = code) {
  return { statusCode, code, message };
}

/** Body of an unmocked route, so a missing mock is obvious in traces. */
export const NOT_MOCKED = { statusCode: 404, message: "Not mocked in e2e" };
