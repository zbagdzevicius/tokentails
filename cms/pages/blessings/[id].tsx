'use client';

import { BLESSING_API } from '@/api/blessing-api';
import { SHELTER_API } from '@/api/shelter-api';
import { TailsCard } from '@/components/tailsCard/TailsCard';
import { Button } from '@/components/ui/button';
import { Previews } from '@/components/ui/drag-drop';
import { Input } from '@/components/ui/input';
import { Labeled } from '@/components/ui/labeled';
import { Loader } from '@/components/ui/loader';
import { TextArea } from '@/components/ui/textarea';
import { useProfile } from '@/context/ProfileContext';
import { useToast } from '@/context/ToastContext';
import {
  BlessingType,
  IBlessingInput,
  Status,
  Statuses
} from '@/models/blessing';
import { ICat } from '@/models/cats';
import { IImage } from '@/models/image';
import { PERMISSION_LEVEL } from '@/models/profile';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

export default function Blessing() {
  const params = useParams<{ id: string }>();
  const [id, setId] = useState(params!.id === 'create' ? null : params!.id);
  const { data: blessing, isLoading } = useQuery({
    queryKey: ['blessing', id],
    queryFn: () => (id ? BLESSING_API.blessingFetch(id) : null)
  });
  const router = useRouter();
  const { profile } = useProfile();
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>(Status.WAITING);
  const [image, setImage] = useState<IImage[]>([]);
  const [savior, setSavior] = useState<IImage[]>([]);
  const [shelter, setShelter] = useState<string>(profile?.shelter || '');
  const { data: shelters } = useQuery({
    queryKey: ['shelter', profile?._id],
    queryFn: () => SHELTER_API.sheltersFetch()
  });

  // Reset the form whenever the loaded blessing changes. This adjusts state
  // during render instead of in an effect, so the form never paints stale.
  const [formSyncedFor, setFormSyncedFor] = useState<{
    blessing: typeof blessing;
  }>();
  if (!formSyncedFor || formSyncedFor.blessing !== blessing) {
    setFormSyncedFor({ blessing });
    setName(blessing?.name || '');
    setDescription(blessing?.description || '');
    setStatus(blessing?.status || Status.WAITING);
    setImage(blessing?.image ? [blessing.image] : []);
    setSavior(blessing?.savior ? [blessing.savior] : []);
  }

  // Re-pick the default shelter whenever the profile, shelter list or
  // blessing changes, again during render rather than in an effect.
  const [shelterSyncedFor, setShelterSyncedFor] = useState<{
    profile: typeof profile;
    shelters: typeof shelters;
    blessing: typeof blessing;
  }>();
  if (
    !shelterSyncedFor ||
    shelterSyncedFor.profile !== profile ||
    shelterSyncedFor.shelters !== shelters ||
    shelterSyncedFor.blessing !== blessing
  ) {
    setShelterSyncedFor({ profile, shelters, blessing });
    setShelter(
      profile?.shelter ||
        blessing?.shelter ||
        // Pre-existing behaviour kept as-is: this falls back to the whole
        // first shelter object rather than its _id.
        (shelters?.[0] as unknown as string) ||
        ''
    );
  }

  const newCat = useMemo(
    (): IBlessingInput => ({
      _id: blessing?._id,
      name,
      description,
      status,
      image: image[0]?._id,
      savior: savior[0]?._id,
      type: BlessingType.CAT,
      creator: profile?._id,
      shelter: profile?.shelter || shelter
    }),
    [name, description, status, image, savior, profile, blessing, shelter]
  );

  async function saveCatFn() {
    try {
      if (blessing?._id) {
        const update = await BLESSING_API.blessingEdit(newCat);
        if (!update) {
          return;
        }
      } else {
        const blessing = await BLESSING_API.blessingCreate(newCat);
        setId(blessing?._id ?? null);
        if (!blessing) {
          return;
        }
      }
      toast({ message: `Shelter Cat ${name} saved` });
      router.push('/blessings/');
    } catch (e) {
      console.error(e);
      toast({
        message: (e as Error | undefined)?.message || 'Error saving Shelter Cat'
      });
    }
  }
  const { isPending, mutate: saveCat } = useMutation({
    mutationFn: saveCatFn,
    onSuccess: () => {}
  });

  return (
    <div className="flex flex-col gap-4 w-full max-w-[678px] m-auto pb-16">
      <Button onClick={() => router.push('/blessings')}>Go Back</Button>
      {isLoading && <Loader isLoading={isLoading} />}
      {id && blessing && (
        <div className="flex justify-center">
          <TailsCard
            cat={{ ...blessing.cat, blessing } as unknown as ICat}
          />
        </div>
      )}
      <Labeled label="SHELTER">
        {(profile?.permission || 0) >= PERMISSION_LEVEL.MANAGER ? (
          shelters?.map((shelterOption) => (
            <Button
              variant={shelterOption._id === shelter ? 'default' : 'outline'}
              key={shelterOption._id}
              onClick={() => setShelter(shelterOption._id!)}
            >
              {shelterOption.name}
            </Button>
          ))
        ) : (
          <Button>
            {shelters?.find((shelterOption) => shelterOption._id === shelter)
              ?.name || ''}
          </Button>
        )}
      </Labeled>
      <Labeled label="STATUS">
        {Statuses?.map((statusOption) => (
          <Button
            variant={status === statusOption ? 'default' : 'outline'}
            key={statusOption}
            onClick={() => setStatus(statusOption)}
          >
            {statusOption}
          </Button>
        ))}
      </Labeled>
      <Labeled label="CAT NAME">
        <Input
          placeholder="Shelter Cat name"
          className="w-full rounded-lg bg-background pl-8"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Labeled>
      <Labeled label="CAT DESCRIPTION ( short story )">
        <TextArea
          placeholder="Shelter Cat story"
          className="w-full rounded-lg bg-background pl-8"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Labeled>
      <Labeled label="CAT PICTURE">
        <Previews maxFiles={1} value={image} onChange={setImage} />
      </Labeled>
      <Labeled label="ADOPTION PICTURE ( optional - submit after finding an owner :3 <3 )">
        <Previews maxFiles={1} value={savior} onChange={setSavior} />
      </Labeled>

      <Loader isLoading={isPending}>
        <Button onClick={() => saveCat()}>Save Shelter Cat</Button>
      </Loader>
      <Button variant="outline" onClick={() => router.push('/blessings')}>
        Cancel
      </Button>
    </div>
  );
}
