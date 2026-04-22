import { ISave, ISaved } from "@/models/save";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useCallback, useState } from "react";
import { ISavedMetadata } from "../models/save";
import { useProfile } from "./ProfileContext";
import { ARTICLE_API } from "@/api/article-api";

type ContextState = {
  entityMetadata: Record<string, ISaved>;
  setEntityMetadata: (entityMetadta: Record<string, ISaved>) => void;
  add: (entityMetadataStack: ISave) => void;
};

const useStackState = (initialArray: any[]) => {
  const [state, setState] = useState(initialArray);

  const add = useCallback(
    (value: any) => {
      setState((currentValue) => currentValue.concat(value));
    },
    [setState]
  );
  const reset = useCallback(() => {
    setState([]);
  }, [setState]);

  return { state, add, reset };
};

const EntityMetadataContext = React.createContext<ContextState | undefined>(
  undefined
);

const EntityMetadataProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [entityMetadata, setEntityMetadata] = React.useState<
    Record<string, ISaved>
  >({});

  const { state, add, reset } = useStackState([]);
  const { profile } = useProfile();
  const fetchMetadata = () => ARTICLE_API.getMetadata(profile ? state : []);
  const { data } = useQuery({
    queryKey: ["entity-metadata", state, profile],
    queryFn: fetchMetadata,
    staleTime: 1000,
  });
  React.useEffect(() => {
    if (data?.length) {
      setEntityMetadata((currentEntityMetadata) => {
        const snapshot = { ...currentEntityMetadata };
        data?.forEach((saved) => (snapshot[saved.entity] = saved));
        reset();

        return snapshot;
      });
    }
  }, [data, setEntityMetadata, reset]);
  const value = { entityMetadata, setEntityMetadata, add };

  return (
    <EntityMetadataContext.Provider value={value}>
      {children}
    </EntityMetadataContext.Provider>
  );
};

const getNewMetadataEntity = (
  currentEntityMetadata: ISaved,
  savedMetadata: Partial<ISavedMetadata>
) => {
  return {
    ...(currentEntityMetadata || {}),
    ...savedMetadata,
  };
};

function useEntityMetadata({ entity, type }: ISave): {
  likeToggle: () => void;
  getEntityMetadata: () => ISaved;
} {
  const { profile } = useProfile();
  const { entityMetadata, setEntityMetadata, add } = React.useContext(
    EntityMetadataContext
  )!;

  React.useEffect(() => {
    if (profile) {
      add({ entity, type });
    }
  }, [profile, add, entity, type]);
  // RETRIEVE
  const getEntityMetadata = useCallback(() => {
    return entityMetadata[entity] || {};
  }, [entityMetadata, entity]);
  const memoizedGetEntityMetadata = React.useMemo(
    () => getEntityMetadata,
    [entityMetadata]
  );

  // LIKE
  const likeToggleSave = useCallback(() => {
    setEntityMetadata({
      ...entityMetadata,
      [entity]: getNewMetadataEntity(
        { ...(entityMetadata[entity] || { entity, type }) },
        { isLiked: !entityMetadata[entity]?.isLiked }
      ),
    });
  }, [entityMetadata, setEntityMetadata, entity, type]);

  const likeToggleCall = useCallback(
    async (params: ISave) => {
      if (!profile) {
        throw Error("Not signed in");
      }
      if (getEntityMetadata().isLiked) {
        return {};
      }
      return ARTICLE_API.like(params);
    },
    [profile, getEntityMetadata]
  );
  const likeToggle = useMutation({
    mutationFn: likeToggleCall,
    onSuccess: () => {
      likeToggleSave();
    },
  });

  return {
    likeToggle: () => likeToggle.mutate({ entity, type }),
    getEntityMetadata: memoizedGetEntityMetadata,
  };
}

export { EntityMetadataProvider, useEntityMetadata };
