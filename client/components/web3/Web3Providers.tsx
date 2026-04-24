import { Web3Provider } from "@/context/Web3Context";
import { PropsWithChildren } from "react";

export const Web3Providers = ({ children }: PropsWithChildren<{}>) => {
  return <Web3Provider>{children}</Web3Provider>;
};
