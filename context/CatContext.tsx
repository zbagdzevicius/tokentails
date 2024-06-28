import { updateCatStatus } from "@/constants/api";
import { ICatStatus, IProfileCat } from "@/models/cats";
import { IStatus } from "@/models/status";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";
import { useCallback } from "react";

type ContextState = {
  cat: IProfileCat | null;
  setCat: (cat: IProfileCat) => void;
  setCatStatus: (status: IStatus) => void;
};

const CatContext = React.createContext<ContextState | undefined>(undefined);

const CatProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [cat, setCat] = React.useState<IProfileCat | null>(null);

  const saveStatusCall = useCallback(
    async (params: ICatStatus) => {
      if (!cat) {
        throw Error("Not signed in");
      }

      await updateCatStatus(cat._id!, params);
    },
    [cat, setCat]
  );
  // SAVE
  const saveStatus = useMutation({
    mutationFn: saveStatusCall,
    onSuccess: () => {},
  });

  const setCatStatus = useCallback(
    (status: IStatus) => {
      if (!cat) {
        return;
      }
      const newStatus = {
        ...cat,
        status: { ...(cat.status || {}), [status.type]: status.status },
      };
      if ((newStatus.status[status.type] || 0) <= status.status) {
        setCat(newStatus);
        saveStatus.mutate(newStatus.status);
      }
    },
    [cat, setCat, saveStatus]
  );
  const value = { cat, setCat, setCatStatus };

  return <CatContext.Provider value={value}>{children}</CatContext.Provider>;
};

function useCat() {
  const context = React.useContext(CatContext);

  return {
    setCat: context?.setCat,
    cat: context?.cat,
    setCatStatus: context?.setCatStatus!,
  };
}

export { CatProvider, useCat };
