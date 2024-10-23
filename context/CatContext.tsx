import { updateCatStatus } from "@/constants/api";
import { ICat, ICatStatus } from "@/models/cats";
import { IStatus, StatusType } from "@/models/status";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";
import { useCallback } from "react";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";

type ContextState = {
  cat?: ICat | null;
  setCatStatus: (status: IStatus) => void;
};

const CatContext = React.createContext<ContextState | undefined>(undefined);

export const MAX_CAT_STATUS = 4;

function isMaxReached(status: IStatus, cat: ICat): boolean {
  if (!cat.status.EAT || cat.status.EAT >= MAX_CAT_STATUS) {
    return false;
  }

  const newStatuses: Record<StatusType, number> = {
    ...{ [StatusType.EAT]: 0 },
    ...cat.status,
    [status.type]: status.status,
  };

  return newStatuses[StatusType.EAT] >= MAX_CAT_STATUS;
}

const CatProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const { setProfileUpdate, profile } = useProfile();
  const cat = React.useMemo(() => profile?.cat, [profile?.cat!]);
  const toast = useToast();

  const saveStatusCall = useCallback(
    async (params: ICatStatus) => {
      if (!cat) {
        throw Error("Not signed in");
      }

      await updateCatStatus(cat._id!, params);
    },
    [cat]
  );
  // SAVE
  const saveStatus = useMutation({
    mutationFn: saveStatusCall,
    onSuccess: () => {},
  });

  const setCatStatus = useCallback(
    async (status: IStatus) => {
      if (!cat) {
        return;
      }

      const shouldAddPoints = isMaxReached(status, cat);

      if (shouldAddPoints) {
        toast({
          message: "9 Lives and 1000 Catpoints added!",
        });
      }

      const newStatus = {
        ...cat,
        status: { ...(cat.status || {}), [status.type]: status.status },
      };
      setProfileUpdate({
        catbassadorsLives: (profile?.catbassadorsLives || 0) + 9,
        catpoints: (profile?.catpoints || 0) + 1000,
        cat: newStatus,
      });
      await saveStatus.mutate(newStatus.status);
    },
    [saveStatus]
  );
  const value = { cat, setCatStatus };

  return <CatContext.Provider value={value}>{children}</CatContext.Provider>;
};

function useCat() {
  const context = React.useContext(CatContext);

  return {
    cat: context?.cat,
    setCatStatus: context?.setCatStatus!,
  };
}

export { CatProvider, useCat };
