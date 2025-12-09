import { StartGame } from "@/components/base/config";
import { CatAbilityType } from "@/models/cats";
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import { GameEvents, IPhaserGame, NPC_TYPE } from "../Phaser/events";

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const cats = [
  {
    _id: "68218d85b701ef26a1f74748",
    name: "Eggy",
    resqueStory:
      '<p class="p1">Eggy is Long, sassy, classy, and cute. Loves fishes and fishing. She&rsquo;s the most diva floppy-eared, raccoon-tailed, football head you&rsquo;ll ever meet.</p>',
    type: "AIR",
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOLD/necklace-gold.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOLD/necklace-gold/GROOMING.gif",
    status: {
      EAT: 0,
    },
    owner: "66f4fb69fbe634f35473cc07",
    blessing: 
      {
        _id: "6817526791e8650afe8b6842",
        name: "Eggy",
        description:
          '<p class="p1">Eggy is Long, sassy, classy, and cute. Loves fishes and fishing. She&rsquo;s the most diva floppy-eared, raccoon-tailed, football head you&rsquo;ll ever meet. She&rsquo;s Egg-exotic. A Tanuki with the color palette of an egg. She\'s the unbothered queen.</p>',
        birthDate: "2025-05-04T11:41:27.314Z",
        image: {
          _id: "6817526391e8650afe8b683d",
          url: "https://tokentails.fra1.cdn.digitaloceanspaces.com/47542906286.png",
        },
        images: [],
        instagram: "https://www.instagram.com/pretty_kitty_cattery/",
        creator: "6617964db58ff94dad48febc",
        cat: "6817526791e8650afe8b6843",
        shelter: "675f4533cdb28696a94806fc",
        owner: "675f4533cdb28696a94806fc",
        createdAt: "2025-05-04T11:41:27.452Z",
        updatedAt: "2025-05-04T17:49:46.725Z",
        __v: 0,
      },
    shelter: "675f4533cdb28696a94806fc",
  },
  {
    _id: "67af9d4494ec0113d9a7e81a",
    name: "Coolio",
    resqueStory:
      "Coolio’s got a floral helmet and an attitude. 'Florals for spring? Groundbreaking.' She makes petals look fierce",
    type: "DARK",
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GREY/flover-moon-camellia.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GREY/flover-moon-camellia/JUMPING.gif",
    status: {
      EAT: 0,
    },
  },
  {
    _id: "6761baa9b8ca32f816984766",
    name: "Token Tails",
    resqueStory:
      "Whiskers chased his own tail, caught it, and discovered it was a burrito!",
    type: "TAILS",
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hat-viking.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hat-viking/WALKING.gif",
    status: {
      EAT: 0,
    },
  },
  {
    _id: "67517f2cc1eee12857d738c2",
    name: "Tangled Lights",
    resqueStory:
      "Tangled Lights gets caught in every strand of festive lights but shines brighter each time!",
    type: "ELECTRIC",
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GREY/festive-lights-tangled.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GREY/festive-lights-tangled/JUMPING.gif",
    status: {
      EAT: 0,
    },
  },
];

const PreviewGame = forwardRef<IPhaserGame, IProps>(function PhaserGame(
  { currentActiveScene },
  ref
) {
  const game = useRef<Phaser.Game | null>(null!);

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame();

      if (typeof ref === "function") {
        ref({ game: game.current, scene: null });
      } else if (ref) {
        ref.current = { game: game.current, scene: null };
      }
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
      }
    };
  }, [ref]);

  GameEvents.GAME_LOADED.use((event) => {
    if (!event) {
      return;
    }
    const scene = event.scene;
    if (currentActiveScene && typeof currentActiveScene === "function") {
      currentActiveScene(scene);
    }

    if (typeof ref === "function") {
      ref({ game: game.current, scene });
    } else if (ref) {
      ref.current = {
        game: game.current,
        scene: event.scene,
      };
    }
  });

  return <div id="game-container" className="animate-opacity flex"></div>;
});

function Preview() {
  const phaserRef = useRef<IPhaserGame | null>(null);

  const cat = {
    _id: "690afd5f3b7bee080161547d",
    name: "Pumpkin",
    resqueStory:
      "<p>The little Pumpkin found a big pumpkin and decided it would be his new home. He climbed inside but got stuck &ndash; now he looks like an orange lantern with a tail! All the kids are running away screaming, while he&rsquo;s just trying to get out and figure out why everyone&rsquo;s running from him 🎃🐱</p>",
    isBlueprint: false,
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOLD/hat-pumpkin.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOLD/hat-pumpkin/IDLE.gif",
    origin: "BALINESE",
    status: {
      EAT: 0,
    },
    owner: "6617964db58ff94dad48febc",
    blessings: [
      {
        _id: "69068b949e82bafcb6e35205",
        name: "Pumpkin",
        description:
          "<p>The little Pumpkin found a big pumpkin and decided it would be his new home. He climbed inside but got stuck &ndash; now he looks like an orange lantern with a tail! All the kids are running away screaming, while he&rsquo;s just trying to get out and figure out why everyone&rsquo;s running from him 🎃🐱</p>",
        image: {
          _id: "69068b629e82bafcb6e351f0",
          url: "https://tokentails.fra1.cdn.digitaloceanspaces.com/29492453532.png",
        },
        images: [],
        instagram: "https://x.com/tokentails",
        updatedAt: "2025-11-05T08:35:27.970Z",
        __v: 0,
      },
    ],
    tokenId: 30490542466,
    shelter: "675f4533cdb28696a94806fc",
    createdAt: "2025-11-05T07:31:43.217Z",
    updatedAt: "2025-11-06T01:00:00.014Z",
    type: CatAbilityType.ELECTRIC,
    __v: 0,
  };

  const isGameLoaded = GameEvents.GAME_LOADED.use();
  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat: cat as any });

      if ((cat.status.EAT || 0) < 4) {
        GameEvents.CAT_MEOW.push({ cat });
      }
    }
  }, [cat, isGameLoaded]);

  useEffect(() => {
    if (isGameLoaded?.scene) {
      // First, clear existing NPCs
      GameEvents.CLEAR_NPCS.push();

      // Then spawn all cats that aren't the current player cat
      cats.forEach((singleCat) => {
        GameEvents.PLAYER_CATS.push({
          npc: singleCat as any,
          type: NPC_TYPE.PLAYER_CATS,
        });
      });
    }
  }, [isGameLoaded, cat]);

  return (
    <div id="app" className="relative z-20 h-full">
      <PreviewGame ref={phaserRef} />
    </div>
  );
}

export default Preview;
