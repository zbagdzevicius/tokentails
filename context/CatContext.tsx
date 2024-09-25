import { updateCatStatus } from "@/constants/api";
import { ICatStatus, ICat } from "@/models/cats";
import { IStatus, StatusType } from "@/models/status";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";
import { useCallback } from "react";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";

type ContextState = {
  cat: ICat | null;
  setCat: (cat: ICat) => void;
  setCatStatus: (status: IStatus) => void;
};

const CatContext = React.createContext<ContextState | undefined>(undefined);

const MAX_CAT_STATUS = 4;

function isMaxReached(status: IStatus, cat: ICat): boolean {
  if (!cat.status.EAT || !cat.status.PLAY) {
    return false;
  }

  if (cat.status.EAT >= MAX_CAT_STATUS && cat.status.PLAY >= MAX_CAT_STATUS) {
    return false;
  }

  const newStatuses: Record<StatusType, number> = {
    ...{ [StatusType.EAT]: 0, [StatusType.PLAY]: 0 },
    ...cat.status,
    [status.type]: status.status,
  };

  const areBothStatusesMaxedOut =
    newStatuses[StatusType.EAT] >= MAX_CAT_STATUS &&
    newStatuses[StatusType.PLAY] >= MAX_CAT_STATUS;

  return areBothStatusesMaxedOut;
}

const CatProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [cat, setCat] = React.useState<ICat | null>(null);
  const { setProfileUpdate, profile } = useProfile();
  const toast = useToast();

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

      const shouldAddPoints = isMaxReached(status, cat);

      if (shouldAddPoints) {
        setProfileUpdate({
          catbassadorsLives: (profile?.catbassadorsLives || 0) + 9,
          catpoints: (profile?.catpoints || 0) + 1000,
        });

        toast({
          message: "9 Lives and 1000 Catpoints added!",
        });
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
