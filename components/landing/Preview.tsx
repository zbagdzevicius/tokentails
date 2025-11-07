import { StartGame } from "@/components/base/config";
import { CatAbilityType, ICat } from "@/models/cats";
import { StatusType } from "@/models/status";
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
    price: 1000,
    supply: 196,
    totalSupply: 200,
    type: "AIR",
    isBlueprint: false,
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOLD/necklace-gold.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOLD/necklace-gold/GROOMING.gif",
    origin: "BALINESE",
    status: {
      EAT: 0,
    },
    owner: "66f4fb69fbe634f35473cc07",
    blessings: [
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
        price: 1000,
        instagram: "https://www.instagram.com/pretty_kitty_cattery/",
        creator: "6617964db58ff94dad48febc",
        cat: "6817526791e8650afe8b6843",
        shelter: "675f4533cdb28696a94806fc",
        owner: "675f4533cdb28696a94806fc",
        createdAt: "2025-05-04T11:41:27.452Z",
        updatedAt: "2025-05-04T17:49:46.725Z",
        __v: 0,
      },
    ],
    shelter: "675f4533cdb28696a94806fc",
    createdAt: "2025-05-04T11:41:27.380Z",
    updatedAt: "2025-11-06T01:00:00.014Z",
    __v: 0,
    token: {
      evm: "0x76263f73d928c2bb416c42c11773da68f6cabcf5d3a63b91d454d49bb2e0d554",
      sei: null,
    },
    tokenId: 5854763872,
  },
  {
    _id: "67af9d4494ec0113d9a7e81a",
    name: "Coolio",
    resqueStory:
      "Coolio’s got a floral helmet and an attitude. 'Florals for spring? Groundbreaking.' She makes petals look fierce",
    price: 2000,
    supply: 10,
    catpoints: 10000000,
    ability: "FURSHADOW",
    type: "DARK",
    tier: "MYTHICAL",
    isBlueprint: false,
    isExclusive: false,
    collectionType: "TOKENTAILS",
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GREY/flover-moon-camellia.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GREY/flover-moon-camellia/JUMPING.gif",
    cardImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/cards/TOKENTAILS/coolio.png",
    origin: "GREY",
    status: {
      EAT: 0,
    },
    owner: "66f4fb69fbe634f35473cc07",
    blessings: [],
    createdAt: "2024-09-29T19:46:54.231Z",
    updatedAt: "2025-11-06T01:00:00.014Z",
    __v: 0,
    token: {
      evm: "0xbf629531a057d7b28e68b28527e338f82524c62dfa9332dc4d34ac45435ef00d",
      sei: null,
    },
    tokenId: 95522672977,
    totalSupply: 10,
    ai: "RUNNING",
  },
  {
    _id: "6761baa9b8ca32f816984766",
    name: "Token Tails",
    resqueStory:
      "Whiskers chased his own tail, caught it, and discovered it was a burrito!",
    price: 10,
    supply: 10,
    ability: "ICECLAW",
    type: "TAILS",
    tier: "DIVINE",
    isBlueprint: false,
    isExclusive: false,
    collectionType: "TOKENTAILS",
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hat-viking.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hat-viking/WALKING.gif",
    cardImg:
      "https://tokentails.fra1.cdn.digitaloceanspaces.com/assets/cards/TOKENTAILS/token-tails-27370072191.png",
    origin: "PINKIE",
    status: {
      EAT: 0,
    },
    owner: "66f4fb69fbe634f35473cc07",
    blessings: [],
    createdAt: "2024-12-15T21:41:12.399Z",
    updatedAt: "2025-11-06T01:00:00.014Z",
    __v: 0,
    token: {
      evm: "0x8714c6c356c710d484d14754fad9f3199080fd835cbb40d963f6ab90f7b02bf0",
      stellar:
        "2c64629263ad67b9b3e52d30ccaf3eaf0c19f436d9716731b28ba4597d34ff28",
      sei: null,
    },
    tokenId: 70617636445,
    staked: "2025-01-24T13:19:40.659Z",
    totalSupply: 10,
    ai: "RUNNING",
  },
  {
    _id: "67517f2cc1eee12857d738c2",
    name: "Tangled Lights",
    resqueStory:
      "Tangled Lights gets caught in every strand of festive lights but shines brighter each time!",
    supply: 10,
    catpoints: 100000,
    ability: "PURRSTORM",
    type: "ELECTRIC",
    tier: "MYTHICAL",
    isBlueprint: false,
    isExclusive: true,
    collectionType: "TOKENTAILS",
    spriteImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GREY/festive-lights-tangled.png",
    catImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GREY/festive-lights-tangled/JUMPING.gif",
    cardImg:
      "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/cards/TOKENTAILS/tangled-lights.png",
    origin: "GREY",
    status: {
      EAT: 0,
    },
    owner: "66f4fb69fbe634f35473cc07",
    blessings: [],
    updatedAt: "2025-11-06T01:00:00.014Z",
    createdAt: "2024-12-05T10:23:40.368Z",
    __v: 0,
    totalSupply: 10,
    ai: "RUNNING",
    token: {
      evm: "0x9c9a2fddc4005abcf325efbf350be53d95a1661ede4511a19f6209a7dae8daa0",
      sei: null,
    },
    tokenId: 87029916552,
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

  return <div id="game-container" className="animate-opacity"></div>;
});

function Preview() {
  const phaserRef = useRef<IPhaserGame | null>(null);

  const cat = {
    _id: "690afd5f3b7bee080161547d",
    name: "Pumpkin",
    resqueStory:
      "<p>The little Pumpkin found a big pumpkin and decided it would be his new home. He climbed inside but got stuck &ndash; now he looks like an orange lantern with a tail! All the kids are running away screaming, while he&rsquo;s just trying to get out and figure out why everyone&rsquo;s running from him 🎃🐱</p>",
    price: 0,
    supply: -2,
    totalSupply: 0,
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
        price: 99997,
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
    <div id="app" className="z-20 h-full">
      <PreviewGame ref={phaserRef} />
    </div>
  );
}

export default Preview;
