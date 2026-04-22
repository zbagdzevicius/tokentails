'use client';

import { SHELTER_API } from '@/api/shelter-api';
import { USER_API } from '@/api/user-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Labeled } from '@/components/ui/labeled';
import { useToast } from '@/context/ToastContext';
import { PackType } from '@/models/profile';
import { IShelter } from '@/models/shelter';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export default function User() {
  const params = useParams<{ id: string }>();
  const [id, setId] = useState(params!.id === 'create' ? null : params!.id);
  const { data: user } = useQuery({
    queryKey: ['user', id],
    queryFn: () => (id ? USER_API.profileFetch(id) : null)
  });
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [discount, setDiscount] = useState('');
  const [permission, setPermission] = useState(0);
  const [shelter, setShelter] = useState<string | null>(null);
  const { data: shelters, refetch } = useQuery({
    queryKey: ['shelter'],
    queryFn: () => SHELTER_API.sheltersFetch()
  });

  useEffect(() => {
    setName(user?.name || '');
    setDiscount(user?.discount || '');
    setEmail(user?.email || '');
    setPermission(user?.permission || 0);
    setShelter(user?.shelter || '');
  }, [user]);

  const newUser = useMemo(
    () => ({
      _id: user?._id,
      name,
      discount,
      email,
      permission,
      shelter
    }),
    [name, email, permission, user, shelter, discount]
  );

  async function saveUser() {
    if (user?._id) {
      await USER_API.userEdit(newUser as any);
    } else {
      const createdUser = await USER_API.userCreate(newUser as any);
      if (createdUser?._id) {
        setId(createdUser._id);
      }
    }
    toast({ message: `User ${name} saved` });
    router.push('/users/');
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-[678px] m-auto pb-16">
      <h1 className="text-xl font-bold bg-white w-full text-center px-8 py-8 rounded-lg border border-black">
        USER
      </h1>
      <Labeled label="PACK TYPE">
        <Button
          variant="outline"
          onClick={() => USER_API.grantPack(user?._id || '', PackType.STARTER)}
        >
          Starter
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            USER_API.grantPack(user?._id || '', PackType.INFLUENCER)
          }
        >
          Influencer
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            USER_API.grantPack(user?._id || '', PackType.LEGENDARY)
          }
        >
          Legendary
        </Button>
      </Labeled>
      <Labeled label="NAME">
        <Input
          placeholder="User name"
          className="w-full rounded-lg bg-background pl-8"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Labeled>
      <Labeled label="DISCOUNT">
        <Input
          placeholder="Discount"
          className="w-full rounded-lg bg-background pl-8"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </Labeled>
      <Labeled label="EMAIL">
        <Input
          placeholder="Email"
          className="w-full rounded-lg bg-background pl-8"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Labeled>
      <Labeled label="SHELTER">
        {shelters?.map((shelterOption: IShelter) => (
          <Button
            variant={shelterOption._id === shelter ? 'default' : 'outline'}
            key={shelterOption._id}
            onClick={() => setShelter(shelterOption._id!)}
          >
            {shelterOption.name}
          </Button>
        ))}
      </Labeled>
      <Labeled label="PERMISSION ( from 0 to 5 )">
        <Input
          placeholder="Permission"
          className="w-full rounded-lg bg-background pl-8"
          value={permission}
          type="number"
          onChange={(e) =>
            setPermission(
              e.target.value
                ? parseFloat(e.target.value)
                : (e.target.value as any)
            )
          }
        />
      </Labeled>

      <Button onClick={saveUser}>Save User</Button>
      <Button variant="outline" onClick={() => router.push('/users')}>
        Cancel
      </Button>
    </div>
  );
}
