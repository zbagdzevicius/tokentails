'use client';

import { SHELTER_API } from '@/api/shelter-api';
import { Button } from '@/components/ui/button';
import { Previews } from '@/components/ui/drag-drop';
import { Input } from '@/components/ui/input';
import { Labeled } from '@/components/ui/labeled';
import { TextArea } from '@/components/ui/textarea';
import { useToast } from '@/context/ToastContext';
import { IImage } from '@/models/image';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import DateTimePicker from 'react-datetime-picker';
import { Value } from 'react-datetime-picker/dist/cjs/shared/types';

export default function Shelter() {
  const params = useParams<{ id: string }>();
  const [id, setId] = useState(params!.id === 'create' ? null : params!.id);
  const { data: shelter } = useQuery({
    queryKey: ['shelter', id],
    queryFn: () => (id ? SHELTER_API.shelterFetch(id) : null)
  });
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<IImage[]>([]);
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [facebook, setFacebook] = useState('');
  const [twitter, setTwitter] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [foundedAt, setFoundedAt] = useState<Value>(new Date());

  useEffect(() => {
    setName(shelter?.name || '');
    setDescription(shelter?.description || '');
    setImage(shelter?.image ? [shelter.image] : []);
    setAddress(shelter?.address || '');
    setWebsite(shelter?.website || '');
    setFacebook(shelter?.facebook || '');
    setTwitter(shelter?.twitter || '');
    setTiktok(shelter?.tiktok || '');
    setFoundedAt(shelter?.foundedAt || null);
  }, [shelter]);

  const newShelter = useMemo(
    () => ({
      _id: shelter?._id,
      name,
      description,
      image: image[0]?._id,
      address,
      website,
      facebook,
      twitter,
      tiktok,
      foundedAt
    }),
    [
      name,
      description,
      image,
      address,
      website,
      facebook,
      twitter,
      tiktok,
      foundedAt
    ]
  );

  async function saveShelter() {
    if (shelter?._id) {
      await SHELTER_API.shelterEdit(newShelter as any);
    } else {
      const shelter = await SHELTER_API.shelterCreate(newShelter as any);
      setId(shelter._id!);
    }
    toast({ message: `Shelter ${name} saved` });
    router.push('/shelters/');
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-[678px] m-auto pb-16">
      <h1 className="text-xl font-bold bg-white w-full text-center px-8 py-8 rounded-lg border border-black">
        SHELTER
      </h1>
      <Labeled label="NAME">
        <Input
          placeholder="Shelter name"
          className="w-full rounded-lg bg-background pl-8"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Labeled>
      <Labeled label="DESCRIPTION">
        <TextArea
          placeholder="Description"
          className="w-full rounded-lg bg-background pl-8"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Labeled>
      <Labeled label="LOGO">
        <Previews maxFiles={1} value={image} onChange={setImage} />
      </Labeled>
      <Labeled label="ADDRESS">
        <Input
          placeholder="address"
          className="w-full rounded-lg bg-background pl-8"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Labeled>
      <Labeled label="WEBSITE">
        <Input
          placeholder="website"
          className="w-full rounded-lg bg-background pl-8"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </Labeled>
      <Labeled label="FACEBOOK">
        <Input
          placeholder="facebook"
          className="w-full rounded-lg bg-background pl-8"
          value={facebook}
          onChange={(e) => setFacebook(e.target.value)}
        />
      </Labeled>
      <Labeled label="TWITTER">
        <Input
          placeholder="twitter"
          className="w-full rounded-lg bg-background pl-8"
          value={twitter}
          onChange={(e) => setTwitter(e.target.value)}
        />
      </Labeled>
      <Labeled label="TIKTOK">
        <Input
          placeholder="tiktok"
          className="w-full rounded-lg bg-background pl-8"
          value={tiktok}
          onChange={(e) => setTiktok(e.target.value)}
        />
      </Labeled>

      <Labeled label="Founding DATE">
        <DateTimePicker onChange={setFoundedAt} value={foundedAt} />
      </Labeled>

      <Button onClick={saveShelter}>Save Shelter</Button>
      <Button variant="outline" onClick={() => router.push('/shelters')}>
        Cancel
      </Button>
    </div>
  );
}
