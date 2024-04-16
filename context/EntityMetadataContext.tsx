import { ISave, ISaved } from '@/models/save';
import { useMutation, useQuery } from '@tanstack/react-query';
import { entityMetadataFetch, likePost, saveDelete, savePost, unlikePost } from '@/constants/api';
import * as React from 'react';
import { useCallback, useState } from 'react';
import { ISavedMetadata } from '../models/save';
import { useFirebaseAuth } from './FirebaseAuthContext';

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
        [setState],
    );
    const reset = useCallback(() => {
        setState([]);
    }, [setState]);

    return { state, add, reset };
};

const EntityMetadataContext = React.createContext<ContextState | undefined>(undefined);

const EntityMetadataProvider = ({ children }: React.PropsWithChildren<{}>) => {
    const [entityMetadata, setEntityMetadata] = React.useState<Record<string, ISaved>>({});

    const { state, add, reset } = useStackState([]);
    const { user } = useFirebaseAuth();
    const fetchMetadata = () => entityMetadataFetch(user ? state : []);
    const { data } = useQuery({
        queryKey: ['entity-metadata', state, user],
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

    return <EntityMetadataContext.Provider value={value}>{children}</EntityMetadataContext.Provider>;
};

const getNewMetadataEntity = (currentEntityMetadata: ISaved, savedMetadata: Partial<ISavedMetadata>) => {
    return {
        ...(currentEntityMetadata || {}),
        ...savedMetadata,
    };
};

function useEntityMetadata({ entity, type }: ISave): {
    likeToggle: () => void;
    saveToggle: () => void;
    unlikeToggle: () => void;
    getEntityMetadata: () => ISaved;
} {
    const { user, showSignInPopup } = useFirebaseAuth();
    const { entityMetadata, setEntityMetadata, add } = React.useContext(EntityMetadataContext)!;

    React.useEffect(() => {
        if (user) {
            add({ entity, type });
        }
    }, [user, add, entity, type]);
    // RETRIEVE
    const getEntityMetadata = useCallback(() => {
        return entityMetadata[entity] || {};
    }, [entityMetadata, entity]);
    const memoizedGetEntityMetadata = React.useMemo(() => getEntityMetadata, [entityMetadata]);

    // LIKE
    const likeToggleSave = useCallback(() => {
        setEntityMetadata({
            ...entityMetadata,
            [entity]: getNewMetadataEntity(
                { ...(entityMetadata[entity] || { entity, type }) },
                { isLiked: !entityMetadata[entity]?.isLiked },
            ),
        });
    }, [entityMetadata, setEntityMetadata, entity, type]);

    // UNLIKE
    const unlikeToggleSave = useCallback(() => {
        setEntityMetadata({
            ...entityMetadata,
            [entity]: getNewMetadataEntity(
                { ...(entityMetadata[entity] || { entity, type }) },
                { isUnliked: !entityMetadata[entity]?.isUnliked },
            ),
        });
    }, [entityMetadata, setEntityMetadata, entity, type]);

    const saveToggleSave = useCallback(() => {
        setEntityMetadata({
            ...entityMetadata,
            [entity]: getNewMetadataEntity(
                { ...(entityMetadata[entity] || { entity, type }) },
                { isSaved: !entityMetadata[entity]?.isSaved },
            ),
        });
    }, [entityMetadata, setEntityMetadata, entity, type]);

    const saveToggleCall = useCallback(
        async (params: ISave) => {
            if (!user) {
                showSignInPopup();
                throw Error('Not signed in');
            }

            await (getEntityMetadata().isSaved ? saveDelete(params) : savePost(params));
        },
        [user, getEntityMetadata, showSignInPopup],
    );

    // SAVE
    const saveToggle = useMutation({
        mutationFn: saveToggleCall,
        onSuccess: () => {
            saveToggleSave();
        },
    });

    const likeToggleCall = useCallback(
        async (params: ISave) => {
            if (!user) {
                showSignInPopup();
                throw Error('Not signed in');
            }
            if (getEntityMetadata().isLiked) {
                return {};
            }
            return likePost(params);
        },
        [user, showSignInPopup, getEntityMetadata],
    );
    const likeToggle = useMutation({
        mutationFn: likeToggleCall,
        onSuccess: () => {
            likeToggleSave();
        },
    });

    const unlikeToggleCall = useCallback(
        async (params: ISave) => {
            if (!user) {
                showSignInPopup();
                throw Error('Not signed in');
            }
            if (getEntityMetadata().isLiked) {
                return {};
            }
            return unlikePost(params);
        },
        [user, showSignInPopup, getEntityMetadata],
    );
    const unlikeToggle = useMutation({
        mutationFn: unlikeToggleCall,
        onSuccess: () => {
            unlikeToggleSave();
        },
    });

    return {
        likeToggle: () => likeToggle.mutate({ entity, type }),
        unlikeToggle: () => unlikeToggle.mutate({ entity, type }),
        saveToggle: () => saveToggle.mutate({ entity, type }),
        getEntityMetadata: memoizedGetEntityMetadata,
    };
}

export { EntityMetadataProvider, useEntityMetadata };
