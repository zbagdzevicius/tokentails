import { PropsWithChildren } from "react";

export const MainLayout = ({ children }: PropsWithChildren<any>) => {
  return (
    <div>
      <main className="z-10 relative flex flex-col">{children}</main>
    </div>
  );
};
