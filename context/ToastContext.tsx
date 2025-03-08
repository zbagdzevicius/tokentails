import { Toast } from "@/components/shared/Toast";
import * as React from "react";
import { useCallback } from "react";

type ContextState = {
  setToast: (toast: IToast) => void;
};

export interface IToast {
  message?: string;
  icon?: string;
  isError?: boolean;
}

const ToastContext = React.createContext<ContextState | undefined>(undefined);

const ToastProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [toast, setToast] = React.useState<IToast | null>(null);

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (toast) {
      timer = setTimeout(() => setToast(null), 3000);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [toast, setToast]);

  return (
    <ToastContext.Provider value={{ setToast }}>
      {toast?.message && <Toast {...toast} />}
      {children}
    </ToastContext.Provider>
  );
};

function useToast() {
  const context = React.useContext(ToastContext);

  const showToast = useCallback(
    (toast: IToast) => {
      context?.setToast(toast);
    },
    [context]
  );
  return showToast;
}

export { ToastProvider, useToast };
