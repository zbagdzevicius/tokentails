import { ICat } from "@/models/cats";
import { IStatus } from "@/models/status";
import * as React from "react";
import { useCallback } from "react";

type ContextState = {
  cat: ICat | null;
  setCat: (cat: ICat) => void;
};

const ToastContext = React.createContext<ContextState | undefined>(undefined);

const CatProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [cat, setCat] = React.useState<ICat | null>(null);
  const value = { cat, setCat };

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
};

function useCat() {
  const context = React.useContext(ToastContext);

  const setStatus = useCallback(
    (status: IStatus) => {
      const cat = context?.cat! || {};
      console.log(status);
      context?.setCat({
        ...cat,
        status: { ...(cat.status || {}), [status.type]: status.status },
      });
    },
    [context]
  );
  return { setCat: context?.setCat, setStatus, cat: context?.cat };
}

export { CatProvider, useCat };
