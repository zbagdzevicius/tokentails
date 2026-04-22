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
import { Status } from '@/models/blessing';
import { catAbilityTypes } from '@/models/cat';
import { CatAbilityType } from '@/models/cats';
import { IImage } from '@/models/image';
import { PERMISSION_LEVEL } from '@/models/profile';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

export default function Blessing() {
  const params = useParams<{ id: string }>();
  const [id, setId] = useState(params!.id === 'create' ? null : params!.id);
  const { data: blessing } = useQuery({
    queryKey: ['blessing', id],
    queryFn: () => (id ? BLESSING_API.blessingFetch(id) : null)
  });
  const router = useRouter();
  const { profile } = useProfile();
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<IImage[]>([]);
  const [shelter, setShelter] = useState<string>(profile?.shelter || '');
  const [instagram, setInstagram] = useState('');

  // CAT PROPS
  const [type, setType] = useState(CatAbilityType.WIND);
  const [resqueStory, setResqueStory] = useState('');
  const [spriteImg, setSpriteImg] = useState<string>();
  const [catImg, setCatImg] = useState<string>();

  const { data: shelters } = useQuery({
    queryKey: ['shelter', profile?._id],
    queryFn: () => SHELTER_API.sheltersFetch()
  });

  useEffect(() => {
    setName(blessing?.name || '');
    setDescription(blessing?.description || '');
    setImage(blessing?.image ? [blessing.image] : []);
    setInstagram(blessing?.instagram || '');

    // CAT PROPS
    if (blessing?.cat) {
      setType(blessing.cat?.type || CatAbilityType.WIND);
      setResqueStory(blessing.cat?.resqueStory || '');
      setSpriteImg(blessing.cat?.spriteImg || '');
      setCatImg(blessing.cat?.catImg || '');
    }
  }, [blessing]);

  useEffect(() => {
    if (profile?.shelter && !blessing?.shelter) {
      setShelter(profile?.shelter!);
    } else if (blessing?.shelter) {
      setShelter(blessing.shelter);
    } else if (shelters?.[0]) {
      setShelter(shelters[0]._id!);
    } else {
      setShelter('');
    }
  }, [profile, shelters, blessing]);

  const [giveawayUserId, setGiveawayUserId] = useState('');

  async function giveCatToUser() {
    try {
      await BLESSING_API.giveCatToUser(blessing?.cat?._id!, giveawayUserId);
      setGiveawayUserId('');
      toast({ message: 'Cat given to user' });
    } catch (e: any) {
      console.error(e);
      toast({ message: e?.message || 'Error giving cat to user' });
    }
  }

  const newCat = useMemo(
    () => ({
      _id: blessing?._id,
      name,
      description,
      image: image[0]?._id,
      creator: profile?._id,
      shelter: shelter || profile?.shelter,
      instagram,
      // CAT PROPS
      type,
      status: Status.ADOPTED,
      resqueStory,
      spriteImg,
      catImg
    }),
    [
      name,
      description,
      image,
      profile,
      blessing,
      instagram,
      shelter,
      // CAT PROPS
      type,
      resqueStory,
      spriteImg,
      catImg
    ]
  );

  async function saveCatFn() {
    try {
      if (blessing?._id) {
        await BLESSING_API.blessingEdit(newCat as any, true);
      } else {
        const blessing = await BLESSING_API.blessingCreate(newCat as any, true);
        setId(blessing?._id!);
      }
      toast({ message: `Blessing ${name} saved` });
      router.push('/individual/');
    } catch (e: any) {
      console.error(e);
      toast({ message: e?.message || 'Error saving blessing' });
    }
  }
  const { isPending, mutate: saveCat } = useMutation({
    mutationFn: saveCatFn,
    onSuccess: () => {}
  });

  async function updateAvatar() {
    try {
      await BLESSING_API.blessingAvatarUpdate(blessing?._id!);
    } catch (e: any) {
      console.error(e);
      toast({ message: e?.message || 'Error updating avatar' });
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-[678px] m-auto pb-16">
      <h1 className="text-xl font-bold bg-white w-full text-center px-8 py-8 rounded-lg border border-black">
        BLESSING
      </h1>
      <div className="border-4 p-8">
        <h1>User Giveaway</h1>
        <p>Give this cat to a user</p>
        <Input
          placeholder="User ID"
          value={giveawayUserId}
          onChange={(e) => setGiveawayUserId(e.target.value)}
        />
        <Button onClick={giveCatToUser}>Give</Button>
      </div>
      {id && blessing && (
        <div className="flex justify-center">
          <TailsCard
            cat={{ ...blessing?.cat, blessing: blessing as any } as any}
          />
        </div>
      )}
      <Button onClick={updateAvatar}>Update Avatar</Button>
      <Labeled label="NAME">
        <Input
          placeholder="Shelter Cat name"
          className="w-full rounded-lg bg-background pl-8"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Labeled>
      <Labeled label="INSTAGRAM">
        <Input
          placeholder="Instagram"
          className="w-full rounded-lg bg-background pl-8"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
        />
      </Labeled>
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
      <Labeled label="CAT DESCRIPTION">
        <TextArea
          placeholder="Blessing story"
          className="w-full rounded-lg bg-background pl-8"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Labeled>
      <Labeled label="CAT PICTURE">
        <Previews maxFiles={1} value={image} onChange={setImage} />
      </Labeled>
      <Labeled label="CAT PROPS">
        <div className="flex flex-col gap-2">
          <Labeled label="TYPE">
            <div className="flex flex-row gap-2">
              {catAbilityTypes.map((abilityType) => (
                <Button
                  key={abilityType}
                  variant={abilityType === type ? 'default' : 'outline'}
                  onClick={() => setType(abilityType)}
                >
                  {abilityType}
                </Button>
              ))}
            </div>
          </Labeled>
        </div>
        <Labeled label="SPRITE IMAGE">
          <Input
            placeholder="Sprite image"
            className="w-full rounded-lg bg-background pl-8"
            value={spriteImg}
            onChange={(e) => setSpriteImg(e.target.value)}
          />
        </Labeled>
        <Labeled label="CAT IMAGE">
          <Input
            placeholder="Cat image"
            className="w-full rounded-lg bg-background pl-8"
            value={catImg}
            onChange={(e) => setCatImg(e.target.value)}
          />
        </Labeled>
      </Labeled>

      <Loader isLoading={isPending}>
        <Button onClick={() => saveCat()}>Save Blessing</Button>
      </Loader>
      <Button variant="outline" onClick={() => router.push('/individual')}>
        Cancel
      </Button>
    </div>
  );
}
