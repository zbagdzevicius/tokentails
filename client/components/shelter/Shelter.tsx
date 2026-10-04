import { useCat } from "@/context/CatContext";
import { UseStorefront, useStorefront } from "@/hooks/useStorefront";
import { CatAbilityType, CatAbilityTypes, ICat } from "@/models/cats";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TailsCardModal } from "../tailsCard/TailsCardModal";
import {
  GameEvents,
  IPhaserGame,
  NPC_TYPE,
  useGameLoaded,
} from "../Phaser/events";
import { StartGame } from "./config";
import { sample, seededRandom } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { GameModal } from "@/models/game";
import { PixelButton } from "../shared/PixelButton";
import { isApp } from "@/models/app";
import { ShelterCatCheckoutModal, ShelterCatOffer, isCatForSale } from "./ShelterCatBuy";
interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const ShelterGame = forwardRef<IPhaserGame, IProps>(function PhaserGame(
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
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
  }, [ref]);

  useGameLoaded((event) => {
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

/** Pink Paw cats walking the shelter at once; the rest wait for the next visit. */
export const PARTNER_NPC_LIMIT = 10;

/** How long the empty-zone sign stays before it fades (it can also be closed). */
export const EMPTY_SIGN_MS = 8000;

/**
 * Remembers, per browser session, which set of empty zones the sign already announced, so the
 * same "Back soon" or "All adopted" notice is not repeated on every Shelter visit. A different set
 * of empty zones shows the sign again. Storage can be blocked; then the sign shows every visit.
 */
export const EMPTY_SIGN_SESSION_KEY = "tt-shelter-empty-sign";

function readSignSeen(): string | null {
  try {
    return window.sessionStorage.getItem(EMPTY_SIGN_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSignSeen(signature: string) {
  try {
    window.sessionStorage.setItem(EMPTY_SIGN_SESSION_KEY, signature);
  } catch {
    // Blocked storage: the sign simply shows again next visit.
  }
}

export interface ShelterZone {
  type: NPC_TYPE;
  /** Name on the zone's sign. */
  label: string;
  cats: ICat[];
}

/**
 * The Shelter's NPC zones from one storefront (plan G13). The partner zone takes every partner
 * shelter's cats (roles from `_meta`, `rozine-pedute` without them) and walks a repeatable sample
 * of them; the two house zones keep their own floors, keyed by slug in ShelterScene.
 */
export function shelterZones(
  storefront: Pick<UseStorefront, "cats" | "partnerCats" | "meta" | "roles">,
  seed: number
): ShelterZone[] {
  const { cats, partnerCats, meta, roles } = storefront;
  const partnerName =
    meta?.shelters.find((shelter) => shelter.slug === roles.partner[0])
      ?.name || "Pink Paw";
  return [
    {
      type: NPC_TYPE.ROZINE_PEDUTE,
      label: partnerName,
      cats: sample(partnerCats, PARTNER_NPC_LIMIT, seededRandom(seed)),
    },
    {
      type: NPC_TYPE.TOKENTAILS,
      label: "Famous cats",
      cats: cats[NPC_TYPE.TOKENTAILS] ?? [],
    },
    {
      type: NPC_TYPE.TOKENTAILS_2,
      label: "Event cats",
      cats: cats[NPC_TYPE.TOKENTAILS_2] ?? [],
    },
  ];
}

function Shelter() {
  const [selectedNpc, setSelectedNpc] = useState<ICat | null>(null);
  const [showModal, setShowModal] = useState(false);
  // A shelter cat being bought from its card (basic tier, $5, card or crypto).
  const [buyCat, setBuyCat] = useState<ICat | null>(null);

  const storefront = useStorefront();
  const { cats, partnerCats, meta, roles, isReady, failure, isRetrying, retry } =
    storefront;
  // One seed per Shelter visit: a refetch or re-render walks the same Pink Paw cats.
  const [seed] = useState(() => Math.floor(Math.random() * 0xffffffff));
  const zones = useMemo(
    () => shelterZones({ cats, partnerCats, meta, roles }, seed),
    [cats, partnerCats, meta, roles, seed]
  );

  const { cat } = useCat();

  const phaserRef = useRef<IPhaserGame | null>(null);
  const isGameLoaded = GameEvents.GAME_LOADED.use();
  // Run-once guard for the NPC spawn below; never rendered.
  const hasSpawnedNpcRef = useRef(false);
  const [spawnedZones, setSpawnedZones] = useState<ShelterZone[] | null>(null);
  const { setOpenedModal } = useGame();

  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, isGameLoaded]);

  // Freeze the zones once, from a response the UI can trust and a loaded scene. NPCs spawn only
  // once, so the scene and the sign below both use this snapshot; a focus refetch after the stale
  // time must not make the sign disagree with the floor. After a failed load nothing is frozen;
  // RETRY refetches and the zones fill in when it succeeds. (Set during render, React's pattern
  // for state derived from an earlier render.)
  if (spawnedZones === null && isGameLoaded?.scene && isReady) {
    setSpawnedZones(zones);
  }

  useEffect(() => {
    if (hasSpawnedNpcRef.current || !spawnedZones) {
      return;
    }
    hasSpawnedNpcRef.current = true;
    // One batch, so ShelterScene loads every sheet in one pass (G13 step 6).
    const npcs = spawnedZones.flatMap((zone) =>
      zone.cats.map((npc) => ({ npc, type: zone.type }))
    );
    if (npcs.length) {
      GameEvents.NPC_SPAWN_BATCH.push({ npcs });
    }
  }, [spawnedZones]);

  // The zones left empty by the storefront the scene spawned from (frozen once, above).
  const emptyZones = useMemo(
    () => (spawnedZones ?? []).filter((zone) => !zone.cats.length),
    [spawnedZones]
  );
  // Only the partner zone ever had adoptable cats, so only it says "thank you"; empty house zones
  // are "back soon" (decision #87 applied to what the zones actually are).
  const adoptedZones = emptyZones.filter((zone) => zone.type === NPC_TYPE.ROZINE_PEDUTE);
  const soonZones = emptyZones.filter((zone) => zone.type !== NPC_TYPE.ROZINE_PEDUTE);

  // The sign is a notice, not a fixture: it can be closed and fades on its own after a while.
  const [signState, setSignState] = useState<"shown" | "fading" | "gone">("shown");
  const signature = emptyZones
    .map((zone) => zone.type)
    .sort()
    .join(",");
  // Read once per set of empty zones (the zones freeze once per visit), before this visit marks it.
  const signSeen = useMemo(
    () => !!signature && readSignSeen() === signature,
    [signature]
  );
  const hasSign = !!emptyZones.length && !signSeen;
  useEffect(() => {
    if (!hasSign) {
      return;
    }
    writeSignSeen(signature);
    const fade = window.setTimeout(() => setSignState("fading"), EMPTY_SIGN_MS);
    // Also covers reduced motion, where the fade is instant and no transitionend fires.
    const gone = window.setTimeout(() => setSignState("gone"), EMPTY_SIGN_MS + 800);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(gone);
    };
  }, [hasSign, signature]);

  GameEvents.CAT_CARD_DISPLAY.use((event) => {
    if (event) {
      // A copy: the NPC is the storefront query's cached cat, which must not be mutated.
      setSelectedNpc(
        CatAbilityTypes.includes(event.npc.type)
          ? event.npc
          : { ...event.npc, type: CatAbilityType.FAIRY }
      );
      setShowModal(true);
    }
  });

  const onCloseModal = (gameModal?: GameModal) => {
    setShowModal(false);
    if (gameModal) {
      setOpenedModal(gameModal);
    }
  };

  return (
    <div id="app" className="relative z-20">
      <ShelterGame ref={phaserRef} />
      {hasSign && signState !== "gone" && !failure && (
        // One plaque for the empty zones (decision #87): the zones stay, and the sign says why they
        // are quiet instead of showing an empty floor. In short landscape it sits compact in the
        // top-right corner, clear of GO BACK / HOME and the touch controls.
        <div
          role="status"
          data-testid="shelter-empty-zones"
          data-state={signState}
          className={`fixed z-hud left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+6rem)] lg:top-[calc(env(safe-area-inset-top)+8rem)] w-[min(calc(100vw-2rem),24rem)] [@media(max-height:500px)]:left-auto [@media(max-height:500px)]:translate-x-0 [@media(max-height:500px)]:right-[calc(env(safe-area-inset-right)+1rem)] [@media(max-height:500px)]:top-[calc(env(safe-area-inset-top)+0.5rem)] [@media(max-height:500px)]:w-[17rem] [@media(max-height:500px)]:py-1 flex items-center gap-3 rounded-xl border-4 border-tt-gold-shadow bg-tt-night-900/90 pl-2 pr-2 py-2 shadow-[0_4px_0_rgb(var(--tt-night-950))] transition-opacity duration-700 motion-reduce:transition-none ${
            signState === "fading" ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <img
            src="/mascots/actions/happy_sitting.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="w-12 h-12 object-contain shrink-0 [@media(max-height:500px)]:hidden"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
          <div className="min-w-0 flex-1">
            {!!adoptedZones.length && (
              <div data-group="adopted">
                <p className="font-primary text-p3 [@media(max-height:500px)]:text-p4 leading-tight text-tt-gold-400">
                  All adopted, thank you!
                </p>
                <ul className="font-secondary text-p5 tracking-wider text-tt-cream/80 uppercase leading-snug">
                  {adoptedZones.map((zone) => (
                    <li key={zone.type} data-zone={zone.type}>
                      {zone.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!soonZones.length && (
              <div data-group="soon">
                <p
                  className={
                    adoptedZones.length
                      ? "mt-1 font-primary text-p5 leading-tight text-tt-gold-400/80"
                      : "font-primary text-p3 [@media(max-height:500px)]:text-p4 leading-tight text-tt-gold-400"
                  }
                >
                  Back soon
                </p>
                <ul className="font-secondary text-p5 tracking-wider text-tt-cream/60 uppercase leading-snug">
                  {soonZones.map((zone, index) => (
                    <li key={zone.type} data-zone={zone.type} className="inline">
                      {index > 0 && <span aria-hidden="true"> · </span>}
                      {zone.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close notice"
            onClick={() => setSignState("gone")}
            className="self-start shrink-0 w-11 h-11 -mr-3 -mt-3 flex items-center justify-center rounded-lg font-primary text-p4 leading-none text-tt-cream/70 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
          >
            ×
          </button>
        </div>
      )}
      {failure && (
        // Degraded toast (plan G13): stays until RETRY succeeds, so a failed load never looks like
        // an empty shelter. The failure is reported once per fetch as `storefront_degraded`. In
        // short landscape it takes the sign's compact top-right spot, clear of the player cat.
        <div
          role="alert"
          data-testid="storefront-degraded"
          className="fixed z-toast left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+6rem)] lg:top-[calc(env(safe-area-inset-top)+8rem)] w-[min(calc(100vw-2rem),26rem)] [@media(max-height:500px)]:left-auto [@media(max-height:500px)]:translate-x-0 [@media(max-height:500px)]:right-[calc(env(safe-area-inset-right)+1rem)] [@media(max-height:500px)]:top-[calc(env(safe-area-inset-top)+0.5rem)] [@media(max-height:500px)]:w-[17rem] [@media(max-height:500px)]:py-1 flex items-center gap-3 rounded-xl border-4 border-tt-ember bg-tt-night-900/95 pl-2 pr-3 py-2 shadow-[0_4px_0_rgb(var(--tt-night-950))]"
        >
          <img
            src="/mascots/actions/napping.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="w-12 h-12 object-contain shrink-0 [@media(max-height:500px)]:hidden"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="font-primary text-p3 [@media(max-height:500px)]:text-p4 leading-tight text-tt-gold-400">
              The cats didn&apos;t load
            </p>
            <p className="font-secondary text-p5 tracking-wider text-tt-cream/80 uppercase leading-snug">
              Your cat is safe. Try again.
            </p>
          </div>
          <PixelButton
            text={isRetrying ? "..." : "RETRY"}
            disabled={isRetrying}
            onClick={retry}
          />
        </div>
      )}
      {showModal && selectedNpc && (
        <TailsCardModal {...selectedNpc} onClose={() => onCloseModal()}>
          {!isApp && isCatForSale(selectedNpc) ? (
            <ShelterCatOffer
              cat={selectedNpc}
              onBuy={() => {
                setShowModal(false);
                setBuyCat(selectedNpc);
              }}
            />
          ) : null}
        </TailsCardModal>
      )}
      {buyCat && <ShelterCatCheckoutModal cat={buyCat} close={() => setBuyCat(null)} />}
    </div>
  );
}

export default Shelter;
