import { CatbassadorsAuth } from "@/components/catbassadors/CatbassadorsAuth";
import { SDKProvider } from "@telegram-apps/sdk-react";
import { useEffect } from "react";

const debug = true;

const test = () => {
  // Enable debug mode to see all the methods sent and events received.
  useEffect(() => {
    if (debug) {
      import("eruda").then((lib) => lib.default.init());
    }
  }, [debug]);

  return (
    <SDKProvider acceptCustomStyles debug={true}>
      <CatbassadorsAuth></CatbassadorsAuth>
    </SDKProvider>
  );
};

export default test;
