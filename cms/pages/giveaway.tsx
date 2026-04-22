'use client';

import { USER_API } from '@/api/user-api';
import { Button } from '@/components/ui/button';
import { Labeled } from '@/components/ui/labeled';
import { useToast } from '@/context/ToastContext';
import { useState } from 'react';

export default function Giveaway() {
  const [text, setText] = useState('');
  const [type, setType] = useState<'twitter' | 'discord'>('twitter');
  const toast = useToast();

  const onSubmit = async () => {
    const entities = text.split('\n');
    await USER_API.sendBoxes(entities, type);
    toast({ message: 'Boxes sent to ' + entities.length + ' users' });
    setText('');
  };

  return (
    <div defaultValue="all">
      <div className="flex flex-col gap-4">
        <textarea
          value={text}
          placeholder="Enter twitter/discord usernames listed in a new line"
          onChange={(e) => setText(e.target.value)}
        />
        <Labeled label="TYPE">
          <div className="flex flex-row gap-2">
            <Button
              onClick={() => setType('twitter')}
              disabled={type === 'twitter'}
              variant={type === 'twitter' ? 'default' : 'outline'}
            >
              Twitter {type === 'twitter' && '(Selected)'}
            </Button>
            <Button
              onClick={() => setType('discord')}
              disabled={type === 'discord'}
              variant={type === 'discord' ? 'default' : 'outline'}
            >
              Discord {type === 'discord' && '(Selected)'}
            </Button>
          </div>
        </Labeled>
        <Button onClick={onSubmit}>Submit</Button>
      </div>
    </div>
  );
}
