// The one function the checkout uses from `qrcode` (no bundled types; @types/qrcode is not installed).
declare module "qrcode" {
  export interface QRCodeModel {
    modules: { size: number; data: Uint8Array | boolean[]; get(row: number, col: number): number | boolean };
    version: number;
  }
  export function create(text: string, options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H"; version?: number; maskPattern?: number }): QRCodeModel;
}
