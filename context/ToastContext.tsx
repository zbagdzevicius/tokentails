import { Toast } from "@/components/shared/Toast";
import * as React from "react";
import { useCallback } from "react";

type ContextState = {
  setToast: (toast: IToast) => void;
};

export type ICollectibleProperty = "catbassadorsLives" | "tails" | "catpoints";

export interface IToast {
  message?: string;
  icon?: string;
  isError?: boolean;
  symbol?: ICollectibleProperty;
  img?: string;
}

const ToastContext = React.createContext<ContextState | undefined>(undefined);

const ToastProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [currentToast, setCurrentToast] = React.useState<IToast | null>(null);
  const [toastQueue, setToastQueue] = React.useState<IToast[]>([]);

  const setToast = React.useCallback((toast: IToast) => {
    setToastQueue((prevQueue) => [...prevQueue, toast]);
  }, []);

  React.useEffect(() => {
    if (toastQueue.length > 0 && !currentToast) {
      // Display the first toast in the queue
      setCurrentToast(toastQueue[0]);
      setToastQueue((prevQueue) => prevQueue.slice(1));
    }
  }, [toastQueue, currentToast]);

  React.useEffect(() => {
    if (currentToast) {
      const timer = setTimeout(() => {
        setCurrentToast(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [currentToast]);

  return (
    <ToastContext.Provider value={{ setToast }}>
      {currentToast && <Toast {...currentToast} />}
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
