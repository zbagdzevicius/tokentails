'use client';

import { QUEST_API } from '@/api/quest-api';
import { Button } from '@/components/ui/button';
import { Previews } from '@/components/ui/drag-drop';
import { Input } from '@/components/ui/input';
import { Labeled } from '@/components/ui/labeled';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/context/ToastContext';
import { IImage } from '@/models/image';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

export default function Quest() {
  const params = useParams<{ id: string }>();
  const [id, setId] = useState(params!.id === 'create' ? null : params!.id);
  const { data: quest } = useQuery({
    queryKey: ['quest', id],
    queryFn: () => (id ? QUEST_API.questFetch(id) : null)
  });
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [catpoints, setCatpoints] = useState(0);
  const [tails, setTails] = useState(0);
  const [image, setImage] = useState<IImage[]>([]);

  useEffect(() => {
    setName(quest?.name || '');
    setLink(quest?.link || '');
    setCatpoints(quest?.catpoints || 0);
    setTails(quest?.tails || 0);
    setImage(quest?.image ? [quest.image] : []);
  }, [quest]);

  const newQuest = useMemo(
    () => ({
      _id: quest?._id,
      name,
      link,
      catpoints: isNaN(catpoints) ? 0 : catpoints,
      tails: isNaN(tails) ? 0 : tails,
      image: image[0]?._id
    }),
    [name, link, catpoints, image, quest, tails]
  );

  async function saveQuestFn() {
    try {
      if (quest?._id) {
        await QUEST_API.questEdit(newQuest as any);
      } else {
        const quest = await QUEST_API.questCreate(newQuest as any);
        setId(quest?._id!);
      }
      toast({ message: `Quest ${name} saved` });
      router.push('/quests/');
    } catch (e: any) {
      console.error(e);
      toast({ message: e?.message || 'Error saving quest' });
    }
  }
  const { isPending, mutate: saveQuest } = useMutation({
    mutationFn: saveQuestFn,
    onSuccess: () => {}
  });

  return (
    <div className="flex flex-col gap-4 w-full max-w-[678px] m-auto pb-16">
      <h1 className="text-xl font-bold bg-white w-full text-center px-8 py-8 rounded-lg border border-black">
        QUEST
      </h1>
      <Labeled label="NAME">
        <Input
          placeholder="Quest name"
          className="w-full rounded-lg bg-background pl-8"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Labeled>
      <Labeled label="LINK">
        <Input
          placeholder="Quest link"
          className="w-full rounded-lg bg-background pl-8"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </Labeled>
      <Labeled label="CAT POINTS">
        <Input
          placeholder="Cat points reward"
          className="w-full rounded-lg bg-background pl-8"
          type="number"
          value={catpoints}
          onChange={(e) =>
            setCatpoints(
              e.target.value
                ? parseInt(e.target.value)
                : (e.target.value as any)
            )
          }
        />
      </Labeled>
      <Labeled label="$TAILS">
        <Input
          placeholder="Tails reward"
          className="w-full rounded-lg bg-background pl-8"
          type="number"
          value={tails}
          onChange={(e) =>
            setTails(
              e.target.value
                ? parseInt(e.target.value)
                : (e.target.value as any)
            )
          }
        />
      </Labeled>
      <Labeled label="QUEST IMAGE">
        <Previews maxFiles={1} value={image} onChange={setImage} />
      </Labeled>

      <Loader isLoading={isPending}>
        <Button onClick={() => saveQuest()}>Save Quest</Button>
      </Loader>
      <Button variant="outline" onClick={() => router.push('/quests')}>
        Cancel
      </Button>
    </div>
  );
}
