import { ConfettiWrapper } from "@/components/shared/Confetti";
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
  const [confetti, setConfetti] = React.useState<boolean>(false);

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;
    if (toast) {
      setConfetti(true);
      timer = setTimeout(() => setToast(null), 4000);
      timer2 = setTimeout(() => setConfetti(false), 2000);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
        clearTimeout(timer2);
      }
    };
  }, [toast, setToast]);

  return (
    <ToastContext.Provider value={{ setToast }}>
      {toast?.message && <Toast {...toast} />}
      {confetti && <ConfettiWrapper />}
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
