import { PropsWithChildren } from "react";
import dynamic from "next/dynamic";

const SafeWeb3Providers = dynamic(
  () => import("./SafeWeb3Provider").then((mod) => mod.SafeWeb3Providers),
  { ssr: false }
);

export const Web3Providers = ({ children }: PropsWithChildren<{}>) => {
  return <SafeWeb3Providers>{children}</SafeWeb3Providers>;
};
