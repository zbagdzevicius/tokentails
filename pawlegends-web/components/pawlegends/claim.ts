/**
 * The "ADD YOUR MATCHES?" prompt's question (the Heist's decision #18 wording), shared by the web host
 * (PawlegendsHost.tsx) and the app's in-page host (pawlegends-app/src/host/nativeHost.ts). No React.
 */
export function claimQuestion(count: number, account: boolean): string {
  const matches = count === 1 ? "1 match" : `${count} matches`;
  return account
    ? `Add ${matches} played on this device to your account?`
    : `Add ${matches} played on this device to your game progress?`;
}
