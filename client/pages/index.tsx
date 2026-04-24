import Head from "next/head";
import { useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ChevronRight,
  Coins,
  Crown,
  Gamepad2,
  Gauge,
  Globe,
  HandHeart,
  Heart,
  HeartPulse,
  Home,
  MapPin,
  PawPrint as PawPrintIcon,
  Pill,
  Rocket,
  Scroll,
  Shield,
  Sparkles,
  Star,
  Swords,
  Trophy,
  Users,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ShaderAnimation } from "@/components/ui/shader-animation";

const ASSETS = {
  logo: "/forever-feline/logo-token-tails.webp",
  portraitHighness1: "/forever-feline/portrait-highness-1.webp",
  portraitAristocrat1: "/forever-feline/portrait-aristocrat-1.webp",
  portraitHighnessFull: "/forever-feline/portrait-highness-full.webp",
  gameHero: "/forever-feline/game-hero.webp",
  shelterCat: "/forever-feline/shelter-cat.jpg",
};

const DISPLAY_FONT = "'Bebas Neue', 'Inter', sans-serif";
const BODY_FONT = "'Nunito', 'Inter', sans-serif";

const navLinks = [
  { label: "Explore", href: "#features" },
  { label: "App Family", href: "#family" },
  { label: "Stellar", href: "#stellar" },
  { label: "Shelter Impact", href: "#impact" },
  { label: "FAQ", href: "#faq" },
];

const socials = [
  {
    name: "X",
    href: "https://x.com/intent/follow?screen_name=tokentails",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "https://instagram.com/tokentails",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    name: "TikTok",
    href: "https://tiktok.com/@tokentails",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.87a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.3z" />
      </svg>
    ),
  },
  {
    name: "Telegram",
    href: "https://t.me/+ofyPNIfNX5w4ZjM8",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    name: "Discord",
    href: "https://discord.gg/4FVYmnd7Hg",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
];

const stats: Array<{
  icon: LucideIcon;
  value: string;
  label: string;
  incentive: string;
  progress: number;
}> = [
  {
    icon: PawPrintIcon,
    value: "50K+",
    label: "Portraits Created",
    incentive: "35,000,000 $TAILS earned",
    progress: 85,
  },
  {
    icon: Heart,
    value: "800+",
    label: "Strays Saved",
    incentive: "15,000,000 $TAILS earned",
    progress: 65,
  },
  {
    icon: Globe,
    value: "9",
    label: "Countries",
    incentive: "75,000,000 $TAILS potential",
    progress: 92,
  },
  {
    icon: Users,
    value: "10K+",
    label: "Cat Parents",
    incentive: "100,000,000 $TAILS potential",
    progress: 78,
  },
];

const products: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  image: string;
  cta: string;
  href: string;
  rarity: "Legendary" | "Epic" | "Rare";
  incentive: string;
}> = [
  {
    icon: Crown,
    title: "Royal Portraits",
    description:
      "Upload a photo. Get a masterpiece. 20+ styles from Renaissance to Samurai. Starting at $6.",
    image: ASSETS.portraitHighnessFull,
    cta: "Create Portrait",
    href: "/portrait",
    rarity: "Legendary",
    incentive: "+250K $TAILS potential",
  },
  {
    icon: Gamepad2,
    title: "Play & Adventure",
    description:
      "Your cat becomes a playable hero. Explore worlds, collect treasures, level up together.",
    image: ASSETS.gameHero,
    cta: "Play Now",
    href: "/gaming",
    rarity: "Epic",
    incentive: "+500K $TAILS potential",
  },
  {
    icon: Heart,
    title: "Save Real Cats",
    description:
      "Collect cards of real shelter cats. Every pack funds rescue, rehoming, and care across 9 countries.",
    image: ASSETS.shelterCat,
    cta: "Buy Packs",
    href: "/packs",
    rarity: "Rare",
    incentive: "+100K $TAILS potential",
  },
];

const upcomingApps: Array<{
  icon: LucideIcon;
  mascot: string;
  name: string;
  tagline: string;
  description: string;
  status: "In Development" | "Coming Soon" | "Planned";
  accent: string;
  href: string;
}> = [
  {
    icon: Activity,
    mascot: "/mascots/actions/watching_tv.webp",
    name: "CatWatch",
    tagline: "Behavioral insights, on-chain.",
    description:
      "Passive monitoring of your cat's activity, sleep, and routines. Anomalies surface early, milestones are minted on Stellar.",
    status: "In Development",
    accent: "from-orange-500/30 to-amber-500/10",
    href: "https://catwatch.tokentails.com",
  },
  {
    icon: HeartPulse,
    mascot: "/mascots/actions/doing_yoga.webp",
    name: "CatHealth",
    tagline: "A full medical record that travels with your cat.",
    description:
      "Vet visits, vaccinations, weight, vitals, and symptoms - tokenized as a portable health passport on Stellar.",
    status: "In Development",
    accent: "from-rose-500/30 to-red-500/10",
    href: "https://cathealth.tokentails.com",
  },
  {
    icon: Utensils,
    mascot: "/mascots/tasks/cat_eating_dry_food.webp",
    name: "CatFood",
    tagline: "Smarter feeding, fairer supply.",
    description:
      "Scan nutrition, track meals, and reorder food with sub-cent Stellar payments. Shelter partners get transparent donations at checkout.",
    status: "Coming Soon",
    accent: "from-emerald-500/30 to-teal-500/10",
    href: "https://catfood.tokentails.com",
  },
  {
    icon: Pill,
    mascot: "/mascots/tasks/setting_reminders.webp",
    name: "CatMeds",
    tagline: "Never miss a dose again.",
    description:
      "Prescription reminders, vet-verified refills, and compliance tracking. Meds payable in XLM or USDC with instant settlement.",
    status: "Coming Soon",
    accent: "from-indigo-500/30 to-blue-500/10",
    href: "https://catmeds.tokentails.com",
  },
  {
    icon: MapPin,
    mascot: "/mascots/actions/hiking_on_a_trail.webp",
    name: "CatFind",
    tagline: "A rescue network worth its weight in trust.",
    description:
      "Lost-cat recovery and shelter adoption discovery powered by a Stellar-backed microchip registry and $TAILS bounties.",
    status: "Planned",
    accent: "from-fuchsia-500/30 to-purple-500/10",
    href: "https://catfind.tokentails.com",
  },
];

const stellarBenefits: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Coins,
    title: "Sub-cent micropayments",
    description:
      "Shelter donations, in-app purchases, and $TAILS rewards flow without middlemen eating the margin.",
  },
  {
    icon: Gauge,
    title: "3-5 second finality",
    description:
      "Every mint, reward, and checkout settles in seconds - not minutes - on the Stellar network.",
  },
  {
    icon: Globe,
    title: "Global rails for real impact",
    description:
      "Anchors, on-ramps, and native USDC mean shelters in 9+ countries receive funds without banking friction.",
  },
  {
    icon: Shield,
    title: "Non-profit aligned",
    description:
      "Stellar Development Foundation's mission to expand financial access mirrors our mission to protect cats.",
  },
  {
    icon: Sparkles,
    title: "Soroban-ready",
    description:
      "Cat profiles, health records, and $TAILS rewards are being built as Soroban smart contracts - transparent and auditable.",
  },
  {
    icon: Rocket,
    title: "SCF-backed vision",
    description:
      "We're applying to the Stellar Community Fund to scale the Token Tails family of apps into the world's leading feline care ecosystem.",
  },
];

const testimonials = [
  {
    name: "Sarah M.",
    location: "London, UK",
    avatar: "🇬🇧",
    rating: 5,
    text: "I ordered a Renaissance portrait of my cat Muffin and cried when I saw it. It's now framed above my fireplace. The fact that it helps shelter cats too? Incredible.",
    tag: "Portrait",
  },
  {
    name: "Jake R.",
    location: "Austin, TX",
    avatar: "🇺🇸",
    rating: 5,
    text: "The health tracker caught that my cat's activity dropped. Took her to the vet early, turned out she had a UTI. Token Tails literally saved my cat's life.",
    tag: "Health Tracking",
  },
  {
    name: "Emilie D.",
    location: "Paris, France",
    avatar: "🇫🇷",
    rating: 5,
    text: "My kids play the adventure mode every day with our cat as the character. It's the only screen time I encourage. And we've helped rehome 3 cats through donations.",
    tag: "Adventure & Impact",
  },
  {
    name: "Tom K.",
    location: "Melbourne, AU",
    avatar: "🇦🇺",
    rating: 5,
    text: "Bought the Legendary pack as a gift. Best decision ever. Four stunning portraits, a playable character, and shelter donation included.",
    tag: "Pack Purchase",
  },
  {
    name: "Yuki T.",
    location: "Tokyo, Japan",
    avatar: "🇯🇵",
    rating: 5,
    text: "I tried PetStudio and Petcasso, Token Tails blows them away. The quality is museum-grade, plus app features make it way more than portraits.",
    tag: "Top Quality",
  },
  {
    name: "Maria L.",
    location: "Sao Paulo, Brazil",
    avatar: "🇧🇷",
    rating: 5,
    text: "As a shelter volunteer, seeing Token Tails donate to real shelters is amazing. It's not a gimmick; our shelter received funding directly.",
    tag: "Shelter Partner",
  },
];

const quests: Array<{
  step: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  reward: string;
  status: string;
}> = [
  {
    step: "I",
    icon: Scroll,
    title: "Begin Your Quest",
    subtitle: "Create Profile",
    description:
      "Upload a photo and bring your cat into the Token Tails world.",
    reward: "+100K $TAILS potential",
    status: "AVAILABLE",
  },
  {
    step: "II",
    icon: Swords,
    title: "Explore & Collect",
    subtitle: "Main Quest",
    description:
      "Create portraits, play adventures, collect cards of real shelter cats.",
    reward: "+500K $TAILS potential",
    status: "UNLOCKED",
  },
  {
    step: "III",
    icon: Shield,
    title: "Make an Impact",
    subtitle: "Legendary Quest",
    description:
      "Every action you take helps fund real cat shelters worldwide.",
    reward: "+1M $TAILS potential",
    status: "EPIC",
  },
];

const faqs = [
  {
    question: "Why is Token Tails Stellar-exclusive?",
    answer:
      "Stellar's sub-cent fees, 3-5 second finality, and non-profit foundation align perfectly with our mission. We run all payments, $TAILS rewards, cat profiles, and shelter donations on Stellar - no other chains, no bridges. Our SCF submission outlines how we're scaling the full five-app family on Stellar.",
  },
  {
    question: "What are the 5 upcoming apps in the Token Tails family?",
    answer:
      "CatWatch (behavioral monitoring), CatHealth (medical passport), CatFood (nutrition and feeding), CatMeds (prescription tracking), and CatFind (lost-cat recovery and adoption). Each is built natively on Stellar and shares a single cat identity, $TAILS economy, and shelter-donation flow.",
  },
  {
    question: "How does Token Tails help shelter cats?",
    answer:
      "A portion of every purchase flows directly to partner shelters across 9 countries via Stellar anchors - transparently, with near-zero fees. Funds cover food, medical treatment, spaying/neutering, and rehoming operations.",
  },
  {
    question: "What kind of portraits can I create?",
    answer:
      "We offer 30+ art styles including Renaissance, Victorian, Royal, Warrior, Samurai, Astronaut, and more. Upload a photo and get a high-resolution portrait in seconds.",
  },
  {
    question: "Is Token Tails just a game?",
    answer:
      "No. Token Tails is a family of feline care apps that happens to include playful elements. The live product covers portraits, adventure, and shelter packs; the five upcoming apps cover health, nutrition, meds, and rescue.",
  },
  {
    question: "Can I try Token Tails for free?",
    answer:
      "Yes. You can explore the app and portrait styles for free. Paid portraits, packs, and future app features fund shelter partnerships.",
  },
];

function PawPrint({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="32" cy="42" rx="14" ry="12" />
      <ellipse cx="18" cy="24" rx="7" ry="8" transform="rotate(-15 18 24)" />
      <ellipse cx="32" cy="20" rx="7" ry="8" />
      <ellipse cx="46" cy="24" rx="7" ry="8" transform="rotate(15 46 24)" />
    </svg>
  );
}

function CatSilhouette({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 80"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <polygon points="20,35 10,5 30,20" />
      <polygon points="50,35 60,5 40,20" />
      <ellipse cx="35" cy="40" rx="22" ry="18" />
      <ellipse cx="55" cy="55" rx="30" ry="20" />
      <path
        d="M82,45 Q95,25 90,15"
        strokeWidth="4"
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Whiskers({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      className={className}
      aria-hidden="true"
      stroke="currentColor"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <line x1="60" y1="20" x2="10" y2="8" />
      <line x1="60" y1="20" x2="10" y2="20" />
      <line x1="60" y1="20" x2="10" y2="32" />
      <line x1="60" y1="20" x2="110" y2="8" />
      <line x1="60" y1="20" x2="110" y2="20" />
      <line x1="60" y1="20" x2="110" y2="32" />
      <polygon points="55,17 65,17 60,22" fill="currentColor" />
    </svg>
  );
}

function ShineBorder({
  children,
  className = "",
  borderWidth = 2,
  duration = 14,
  shineColor = ["#F97316"],
}: {
  children: ReactNode;
  className?: string;
  borderWidth?: number;
  duration?: number;
  shineColor?: string[];
}) {
  const style = {
    "--duration": `${duration}s`,
    padding: `${borderWidth}px`,
    backgroundImage: `radial-gradient(transparent, transparent, ${shineColor.join(
      ",",
    )}, transparent, transparent)`,
    backgroundSize: "300% 300%",
  } as CSSProperties;

  return (
    <div className={`relative rounded-2xl ${className}`}>
      <div
        style={style}
        className="absolute inset-0 rounded-[inherit] animate-shine-border"
      />
      <div className="relative rounded-[inherit] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <Head>
        <title>
          Token Tails | A family of feline care apps, built on Stellar
        </title>
        <meta
          name="description"
          content="Token Tails is a Stellar-exclusive family of cat-care apps - CatWatch, CatHealth, CatFood, CatMeds, and CatFind - immortalizing cats as art while funding real shelter rescue worldwide."
        />
        <meta
          property="og:title"
          content="Token Tails | Stellar-exclusive family of feline care apps"
        />
        <meta
          property="og:description"
          content="Five upcoming apps - CatWatch, CatHealth, CatFood, CatMeds, CatFind - powered by Stellar, funding shelter cats across 9 countries."
        />
      </Head>

      <div
        data-forever-feline-page="true"
        className="min-h-screen bg-background text-foreground"
        style={{ fontFamily: BODY_FONT }}
      >
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border"
        >
          <div className="container mx-auto flex items-center justify-between py-4 px-6">
            <a
              href="#"
              className="flex items-center gap-2"
              aria-label="Token Tails home"
            >
              <img src={ASSETS.logo} alt="Token Tails" className="h-8 w-auto" />
            </a>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-left"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href="/game"
              className="portrait-btn-primary inline-flex items-center justify-center px-5 py-2.5 text-sm font-bold"
            >
              Play Game
            </motion.a>
          </div>
        </motion.nav>

        <section className="relative overflow-hidden pt-24 pb-16 md:pt-28 md:pb-20">
          <div className="absolute inset-0 bg-gradient-to-b from-warm-light via-background to-background" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[600px] h-[600px] rounded-full bg-primary/[0.06] blur-[120px] pointer-events-none" />

          <PawPrint className="absolute top-32 left-[8%] w-8 h-8 text-primary/[0.07] rotate-[-20deg]" />
          <PawPrint className="absolute top-48 right-[12%] w-6 h-6 text-primary/[0.05] rotate-[15deg]" />
          <PawPrint className="absolute bottom-24 left-[15%] w-5 h-5 text-primary/[0.04] rotate-[45deg]" />
          <PawPrint className="absolute bottom-16 right-[18%] w-9 h-9 text-primary/[0.06] rotate-[-35deg]" />
          <CatSilhouette className="absolute top-24 right-[5%] w-24 h-20 text-primary/[0.05] rotate-[10deg]" />
          <CatSilhouette className="absolute bottom-10 left-[6%] w-20 h-16 text-primary/[0.04] -scale-x-100 rotate-[-8deg]" />

          <motion.img
            src="/mascots/tasks/paint_a_picture.webp"
            alt="Token Tails mascot painting a portrait"
            initial={{ opacity: 0, y: 20, rotate: -8 }}
            animate={{ opacity: 1, y: 0, rotate: -8 }}
            transition={{ duration: 0.7, delay: 0.35, ease: "easeOut" }}
            className="hidden lg:block absolute bottom-0 left-[4%] xl:left-[7%] w-32 xl:w-40 drop-shadow-xl pointer-events-none select-none"
          />
          <motion.img
            src="/mascots/tasks/taking_a_selfie.webp"
            alt="Token Tails mascot taking a selfie"
            initial={{ opacity: 0, y: 20, rotate: 8 }}
            animate={{ opacity: 1, y: 0, rotate: 8 }}
            transition={{ duration: 0.7, delay: 0.45, ease: "easeOut" }}
            className="hidden lg:block absolute bottom-0 right-[4%] xl:right-[7%] w-32 xl:w-40 drop-shadow-xl pointer-events-none select-none"
          />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6"
            >
              <span className="inline-flex items-center gap-1.5 bg-secondary text-foreground px-4 py-1.5 rounded-full text-sm font-medium">
                <PawPrint className="w-3.5 h-3.5 text-primary/70" />
                Charity-driven · Every action helps shelter cats
                <PawPrint className="w-3.5 h-3.5 text-primary/70" />
              </span>
              <a
                href="#stellar"
                className="group inline-flex items-center gap-2 bg-gradient-to-r from-[#0b0b0b] to-[#1f1f1f] text-white px-3.5 py-1.5 rounded-full text-sm font-semibold border border-white/10 hover:border-primary/50 transition-colors"
              >
                <img
                  src="/logo/stellar-logo-white.webp"
                  alt="Stellar"
                  className="h-3.5 w-auto"
                />
                ecosystem exclusive
              </a>
              <span className="inline-flex items-center gap-1.5 bg-card border border-border px-3 py-1.5 rounded-full text-sm text-muted-foreground">
                <span className="flex">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-3.5 h-3.5 text-primary fill-primary"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                </span>
                <span className="inline-block text-foreground">
                  4.9 · 10K+ cat parents
                </span>
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="text-center text-5xl md:text-7xl lg:text-8xl font-display font-extrabold tracking-tight text-foreground leading-[0.95]"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              Take care of
              <br />
              <span
                style={
                  {
                    "--color-from": "#F97316",
                    "--color-to": "#D97706",
                    "--bg-size": "300%",
                    "--speed": "5.3s",
                  } as CSSProperties
                }
                className="animate-gradient-text inline bg-gradient-to-r from-[var(--color-from)] via-[var(--color-to)] to-[var(--color-from)] bg-[length:var(--bg-size)_100%] bg-clip-text text-transparent"
              >
                your cat
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-5 text-center text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            >
              A family of five feline care apps - CatWatch, CatHealth, CatFood,
              CatMeds, and CatFind - built exclusively on{" "}
              <strong className="text-foreground">Stellar</strong>.
              <br className="hidden md:block" />
              <strong className="text-foreground">
                Care for your cat. Save strays worldwide.
              </strong>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-10 flex justify-center items-end gap-3 md:gap-5"
            >
              <div className="w-[90px] md:w-[130px] -rotate-6 animate-float">
                <ShineBorder
                  borderWidth={2}
                  duration={10}
                  shineColor={["#F97316", "#D97706"]}
                  className="rounded-2xl"
                >
                  <div className="rounded-2xl overflow-hidden shadow-2xl">
                    <img
                      src={ASSETS.portraitHighness1}
                      alt="Cat portrait Highness style"
                      className="w-full h-auto"
                    />
                  </div>
                </ShineBorder>
              </div>

              <div className="w-[140px] md:w-[200px] -translate-y-3 z-10 animate-float-delayed">
                <ShineBorder
                  borderWidth={2}
                  duration={8}
                  shineColor={["#F97316", "#fb923c", "#D97706"]}
                  className="rounded-2xl"
                >
                  <div className="rounded-2xl overflow-hidden shadow-2xl">
                    <video
                      src="https://tokentails.fra1.cdn.digitaloceanspaces.com/pet.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-auto"
                    />
                  </div>
                </ShineBorder>
              </div>

              <div className="w-[90px] md:w-[130px] rotate-6 animate-float">
                <ShineBorder
                  borderWidth={2}
                  duration={12}
                  shineColor={["#D97706", "#F97316"]}
                  className="rounded-2xl"
                >
                  <div className="rounded-2xl overflow-hidden shadow-2xl">
                    <img
                      src={ASSETS.portraitAristocrat1}
                      alt="Cat portrait Aristocrat style"
                      className="w-full h-auto"
                    />
                  </div>
                </ShineBorder>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.65 }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <motion.a
                whileHover={{
                  scale: 1.07,
                  boxShadow: "0 0 50px hsl(28 92% 53% / 0.3)",
                }}
                whileTap={{ scale: 0.95 }}
                href="/portrait"
                className="portrait-btn-primary group relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold"
              >
                Start With Your Cat
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="/gaming"
                className="portrait-btn-secondary inline-flex items-center justify-center px-8 py-4 text-lg font-semibold"
              >
                Explore the App
              </motion.a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="mt-6 flex items-center justify-center gap-3"
            >
              {socials.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="text-muted-foreground hover:text-primary transition-colors p-2 rounded-full hover:bg-secondary"
                >
                  {s.icon}
                </a>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="py-16 bg-charcoal relative overflow-hidden">
          <PawPrint className="absolute top-4 left-[5%] w-8 h-8 text-primary-foreground/[0.03] rotate-[-15deg]" />
          <PawPrint className="absolute bottom-4 right-[8%] w-7 h-7 text-primary-foreground/[0.03] rotate-[20deg]" />
          <CatSilhouette className="absolute top-1/2 right-[3%] w-24 h-20 text-primary-foreground/[0.03] -translate-y-1/2" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />

          <img
            src="/mascots/actions/strong_biceps.webp"
            alt=""
            aria-hidden="true"
            className="hidden md:block absolute -bottom-4 left-[3%] w-28 opacity-80 pointer-events-none select-none -rotate-6"
          />
          <img
            src="/mascots/tasks/celebrating_finishing_work.webp"
            alt=""
            aria-hidden="true"
            className="hidden md:block absolute -top-2 right-[4%] w-24 opacity-90 pointer-events-none select-none rotate-6"
          />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex items-center justify-center gap-2 mb-8"
            >
              <Trophy className="w-5 h-5 text-primary" />
              <span className="text-sm font-display font-bold text-primary uppercase tracking-widest">
                Community Achievements
              </span>
              <Trophy className="w-5 h-5 text-primary" />
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{
                    scale: 1.05,
                    transition: { type: "spring", stiffness: 300 },
                  }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="relative bg-primary-foreground/[0.05] border border-primary-foreground/10 rounded-xl p-5 text-center cursor-default group hover:border-primary/40 transition-all duration-300"
                >
                  <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                  <div className="font-display font-bold text-2xl md:text-3xl text-primary-foreground">
                    {stat.value}
                  </div>
                  <div className="text-xs text-primary-foreground/60 mt-1 mb-3">
                    {stat.label}
                  </div>
                  <div className="w-full bg-primary-foreground/10 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${stat.progress}%` }}
                      viewport={{ once: true }}
                      transition={{
                        delay: i * 0.1 + 0.3,
                        duration: 1,
                        ease: "easeOut",
                      }}
                      className="h-full bg-gradient-to-r from-primary to-warm-dark rounded-full"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-2">
                    <Zap className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-display font-semibold text-primary">
                      {stat.incentive}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 bg-cream relative overflow-hidden">
          <div className="absolute inset-0">
            <ShaderAnimation />
          </div>
          <div className="absolute inset-0 bg-cream/85" />
          <PawPrint className="absolute top-16 left-[5%] w-10 h-10 text-primary/[0.05] rotate-[-20deg]" />
          <PawPrint className="absolute bottom-20 right-[7%] w-8 h-8 text-primary/[0.04] rotate-[25deg]" />
          <Whiskers className="absolute top-[28%] right-[8%] w-20 h-7 text-primary/[0.08]" />

          <motion.img
            src="/mascots/emotions/lovelable.webp"
            alt="Token Tails mascot"
            initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
            whileInView={{ opacity: 1, scale: 1, rotate: -8 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="hidden lg:block absolute left-[6%] top-1/2 -translate-y-1/2 w-40 xl:w-52 drop-shadow-xl pointer-events-none select-none"
          />
          <motion.img
            src="/mascots/actions/chilling.webp"
            alt="Token Tails mascot"
            initial={{ opacity: 0, scale: 0.8, rotate: 8 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 8 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
            className="hidden lg:block absolute right-[6%] top-1/2 -translate-y-1/2 w-36 xl:w-48 drop-shadow-xl pointer-events-none select-none"
          />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto text-center"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary uppercase tracking-wider">
                <PawPrint className="w-4 h-4 text-primary/70" />
                A family of feline apps on Stellar
                <PawPrint className="w-4 h-4 text-primary/70" />
              </span>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-foreground mt-3 leading-tight">
                An ecosystem built
                <br />
                <span className="text-gradient">around cats.</span>
              </h2>
              <p className="text-muted-foreground mt-6 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
                Token Tails starts with art and adventure, but it doesn't stop
                there. Five upcoming apps - CatWatch, CatHealth, CatFood,
                CatMeds, and CatFind - will cover every part of a cat's life,
                all powered by Stellar's low-fee, fast-finality rails, and all
                funding real shelter rescue at the source.
              </p>
            </motion.div>
          </div>
        </section>

        <section
          id="features"
          className="py-24 bg-background relative overflow-hidden"
        >
          <CatSilhouette className="absolute -bottom-4 -left-6 w-32 h-32 text-primary/[0.03]" />
          <CatSilhouette className="absolute top-12 right-[2%] w-20 h-16 text-primary/[0.03] -scale-x-100" />
          <PawPrint className="absolute top-20 right-[6%] w-9 h-9 text-primary/[0.05] rotate-[15deg]" />
          <PawPrint className="absolute bottom-16 left-[4%] w-7 h-7 text-primary/[0.04] rotate-[-20deg]" />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto mb-16"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary uppercase tracking-wider">
                <PawPrint className="w-4 h-4 text-primary/70" />
                Live today
              </span>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-foreground mt-3">
                Three worlds.
                <br />
                <span className="text-gradient">One platform.</span>
              </h2>
              <p className="text-muted-foreground mt-4 text-base md:text-lg max-w-2xl mx-auto">
                The foundation is shipped. 50K+ portraits minted, 800+ cats
                rehomed, payments settling on Stellar.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {products.map((product, i) => (
                <motion.a
                  key={product.title}
                  href={product.href}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -6, transition: { duration: 0.25 } }}
                  whileTap={{ scale: 0.98 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="group bg-card border border-border rounded-3xl overflow-hidden hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 block"
                >
                  <div className="aspect-[4/3] overflow-hidden relative">
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
                    <PawPrint className="absolute bottom-3 right-3 w-6 h-6 text-white/80 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
                    <span
                      className={`absolute top-3 left-3 text-[10px] font-display font-bold uppercase tracking-wider px-2.5 py-1 rounded-full backdrop-blur-sm ${
                        product.rarity === "Legendary"
                          ? "bg-primary/90 text-primary-foreground"
                          : product.rarity === "Epic"
                          ? "bg-purple-600/90 text-white"
                          : "bg-blue-500/90 text-white"
                      }`}
                    >
                      {product.rarity}
                    </span>
                  </div>
                  <div className="p-6">
                    <div className="inline-flex items-center gap-2 bg-warm-light text-primary px-3 py-1 rounded-full text-sm font-medium mb-3">
                      <product.icon className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                      {product.title}
                    </div>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                      {product.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-primary font-display font-semibold text-sm group-hover:gap-3 transition-all duration-300">
                        {product.cta}
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                      </span>
                      <span className="text-[10px] font-display font-bold text-primary bg-warm-light px-2 py-0.5 rounded-full">
                        {product.incentive}
                      </span>
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>
          </div>
        </section>

        <section
          id="family"
          className="py-24 bg-cream relative overflow-hidden"
        >
          <PawPrint className="absolute top-16 left-[5%] w-10 h-10 text-primary/[0.05] rotate-[-20deg]" />
          <PawPrint className="absolute bottom-16 right-[7%] w-8 h-8 text-primary/[0.04] rotate-[25deg]" />
          <CatSilhouette className="absolute top-8 right-[4%] w-24 h-20 text-primary/[0.04]" />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-3xl mx-auto mb-16"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-primary/70" />
                The Token Tails family
              </span>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-foreground mt-3 leading-tight">
                Five apps.{" "}
                <span className="text-gradient">One cat's lifetime.</span>
              </h2>
              <p className="text-muted-foreground mt-6 text-lg leading-relaxed">
                We're expanding Token Tails into a complete feline care suite -
                each app designed to tackle a real, painful problem for cat
                parents, and each built natively on{" "}
                <strong className="text-foreground">Stellar</strong> so value,
                records, and donations move as freely as the love we have for
                our cats.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {upcomingApps.map((app, i) => (
                <motion.a
                  key={app.name}
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -6, transition: { duration: 0.25 } }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="group relative bg-card border border-border rounded-3xl overflow-hidden hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 block"
                >
                  <span
                    className={`absolute top-4 right-4 z-20 text-[10px] font-display font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                      app.status === "In Development"
                        ? "bg-primary text-primary-foreground"
                        : app.status === "Coming Soon"
                        ? "bg-secondary text-primary border border-primary/20"
                        : "bg-background text-muted-foreground border border-border"
                    }`}
                  >
                    {app.status}
                  </span>

                  <div
                    className={`relative h-44 bg-gradient-to-br ${app.accent} flex items-center justify-center overflow-hidden`}
                  >
                    <img
                      src={app.mascot}
                      alt={`${app.name} mascot`}
                      className="h-full w-auto object-contain drop-shadow-xl group-hover:scale-110 transition-transform duration-500 ease-out"
                    />
                  </div>

                  <div className="p-6">
                    <h3 className="font-display font-bold text-2xl text-foreground">
                      {app.name}
                    </h3>
                    <p className="text-primary font-semibold text-sm mt-1 mb-3">
                      {app.tagline}
                    </p>
                    <p className="text-muted-foreground leading-relaxed text-sm mb-4">
                      {app.description}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-primary font-display font-semibold text-sm group-hover:gap-3 transition-all duration-300">
                      Visit {app.name.toLowerCase()}.tokentails.com
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                    </span>
                  </div>
                </motion.a>
              ))}

              <motion.a
                href="#stellar"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="relative bg-charcoal text-primary-foreground border border-primary/20 rounded-3xl p-6 flex flex-col justify-between overflow-hidden group"
              >
                <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-primary/20 blur-3xl group-hover:bg-primary/30 transition-colors" />
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mb-4">
                    <img
                      src="/logo/stellar-logo-white.webp"
                      alt="Stellar"
                      className="w-8 h-8 object-contain"
                    />
                  </div>
                  <h3 className="font-display font-bold text-2xl">
                    All on Stellar.
                  </h3>
                  <p className="text-primary-foreground/70 mt-3 leading-relaxed text-sm">
                    One shared $TAILS economy. One Soroban-native identity per
                    cat. One transparent donation trail.
                  </p>
                </div>
                <span className="relative z-10 inline-flex items-center gap-1.5 text-primary font-display font-semibold text-sm mt-4 group-hover:gap-3 transition-all duration-300">
                  Why Stellar
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                </span>
              </motion.a>
            </div>
          </div>
        </section>

        <section
          id="stellar"
          className="py-24 bg-charcoal relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/10 blur-[140px] pointer-events-none" />
          <PawPrint className="absolute top-14 left-[7%] w-8 h-8 text-primary-foreground/[0.04] rotate-[-15deg]" />
          <PawPrint className="absolute bottom-20 right-[9%] w-9 h-9 text-primary-foreground/[0.04] rotate-[20deg]" />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-3xl mx-auto mb-16"
            >
              <span className="inline-flex items-center gap-2 bg-primary/15 border border-primary/30 text-primary px-4 py-1.5 rounded-full text-sm font-display font-bold uppercase tracking-wider">
                <img
                  src="/logo/stellar-logo-white.webp"
                  alt="Stellar"
                  className="h-4 w-auto"
                />
                Built exclusively on Stellar
              </span>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-primary-foreground mt-5 leading-tight">
                Not multi-chain.
                <br />
                <span className="text-primary">Stellar-native.</span>
              </h2>
              <p className="text-primary-foreground/70 mt-6 text-lg leading-relaxed">
                We picked one chain and built for it deeply. Stellar's speed,
                cost profile, and non-profit mission match ours one-for-one -
                which is why every Token Tails app, from portraits to CatFind,
                runs on it and only it.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {stellarBenefits.map((benefit, i) => (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -4, transition: { duration: 0.25 } }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-primary-foreground/[0.04] border border-primary-foreground/10 rounded-2xl p-6 hover:border-primary/40 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center mb-4">
                    <benefit.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-primary-foreground">
                    {benefit.title}
                  </h3>
                  <p className="text-primary-foreground/70 mt-2 leading-relaxed text-sm">
                    {benefit.description}
                  </p>
                </motion.div>
              ))}
            </div>

          </div>
        </section>

        <section
          className="py-24 bg-background relative overflow-hidden"
          id="impact"
        >
          <PawPrint className="absolute top-20 right-[6%] w-10 h-10 text-primary/[0.05] rotate-[25deg]" />
          <PawPrint className="absolute bottom-24 left-[4%] w-8 h-8 text-primary/[0.04] rotate-[-20deg]" />
          <PawPrint className="absolute top-[50%] left-[3%] w-6 h-6 text-primary/[0.04] rotate-[40deg]" />

          <motion.img
            src="/mascots/emotions/crying.webp"
            alt=""
            aria-hidden="true"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 0.9, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="hidden xl:block absolute top-28 left-[2%] w-28 -rotate-6 drop-shadow-lg pointer-events-none select-none"
          />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-3xl mx-auto mb-16"
            >
              <span className="inline-flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                <Heart className="w-4 h-4 fill-current" />
                Charity-Driven Platform
              </span>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-foreground mt-3 leading-tight">
                We exist to save
                <br />
                <span className="text-gradient">stray cats.</span>
              </h2>
              <p className="text-muted-foreground mt-5 text-lg leading-relaxed max-w-2xl mx-auto">
                Token Tails is a charity-driven movement. Every portrait you
                create, every card you collect, and every game you play helps
                fund shelters rescuing and rehoming stray cats worldwide.
              </p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
              >
                <div className="rounded-3xl overflow-hidden shadow-2xl">
                  <img
                    src={ASSETS.shelterCat}
                    alt="Rescued stray cat"
                    className="w-full h-auto"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <div className="space-y-6">
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-4 cursor-default"
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      transition={{ type: "spring", stiffness: 400 }}
                      className="w-12 h-12 rounded-xl bg-warm-light flex items-center justify-center shrink-0"
                    >
                      <HandHeart className="w-6 h-6 text-primary" />
                    </motion.div>
                    <div>
                      <h3 className="font-display font-bold text-lg text-foreground">
                        Direct shelter funding
                      </h3>
                      <p className="text-muted-foreground mt-1">
                        A portion of every purchase goes directly to partner
                        shelters for food, treatment, and care.
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-4 cursor-default"
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      transition={{ type: "spring", stiffness: 400 }}
                      className="w-12 h-12 rounded-xl bg-warm-light flex items-center justify-center shrink-0"
                    >
                      <Home className="w-6 h-6 text-primary" />
                    </motion.div>
                    <div>
                      <h3 className="font-display font-bold text-lg text-foreground">
                        800+ cats rehomed
                      </h3>
                      <p className="text-muted-foreground mt-1">
                        Our community has already helped over 800 stray cats
                        find loving forever homes.
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-4 cursor-default"
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      transition={{ type: "spring", stiffness: 400 }}
                      className="w-12 h-12 rounded-xl bg-warm-light flex items-center justify-center shrink-0"
                    >
                      <Globe className="w-6 h-6 text-primary" />
                    </motion.div>
                    <div>
                      <h3 className="font-display font-bold text-lg text-foreground">
                        9 countries, growing fast
                      </h3>
                      <p className="text-muted-foreground mt-1">
                        We partner with shelters across 9 countries and keep
                        expanding the rescue network.
                      </p>
                    </div>
                  </motion.div>
                </div>

                <motion.a
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  href="/packs"
                  className="portrait-btn-primary mt-8 inline-flex items-center justify-center px-8 py-4 text-lg font-bold"
                >
                  Support Shelter Cats
                </motion.a>
              </motion.div>
            </div>
          </div>
        </section>

        <section
          className="py-24 bg-background relative overflow-hidden"
          id="reviews"
        >
          <PawPrint className="absolute top-12 left-[6%] w-8 h-8 text-primary/[0.05] rotate-[-20deg]" />
          <PawPrint className="absolute top-20 right-[8%] w-7 h-7 text-primary/[0.04] rotate-[20deg]" />
          <PawPrint className="absolute bottom-16 left-[10%] w-6 h-6 text-primary/[0.04] rotate-[30deg]" />
          <CatSilhouette className="absolute bottom-6 right-[4%] w-24 h-20 text-primary/[0.03]" />

          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto mb-4"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary uppercase tracking-wider">
                <PawPrint className="w-4 h-4 text-primary/70" />
                Testimonials
              </span>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-foreground mt-3">
                Loved by <span className="text-gradient">10,000+</span> cat
                parents
              </h2>
              <p className="text-muted-foreground mt-4 text-lg">
                Join a global community of cat lovers who immortalize, care for,
                and play with their cats while saving strays.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex items-center justify-center gap-2 mb-12"
            >
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-primary fill-primary" />
                ))}
              </div>
              <span className="font-display font-bold text-foreground">
                4.9/5
              </span>
              <span className="text-muted-foreground text-sm">
                from 2,400+ reviews
              </span>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {testimonials.map((testimonial, i) => (
                <motion.div
                  key={testimonial.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-default"
                >
                  <div className="flex items-center gap-1 mb-3">
                    {[...Array(testimonial.rating)].map((_, j) => (
                      <Star
                        key={j}
                        className="w-4 h-4 text-primary fill-primary"
                      />
                    ))}
                  </div>
                  <p className="text-foreground leading-relaxed mb-4">
                    &quot;{testimonial.text}&quot;
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{testimonial.avatar}</span>
                      <div>
                        <p className="font-display font-semibold text-sm text-foreground">
                          {testimonial.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {testimonial.location}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs bg-warm-light text-primary px-2 py-1 rounded-full font-medium whitespace-nowrap">
                      {testimonial.tag}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 bg-cream relative overflow-hidden">
          <PawPrint className="absolute top-12 left-[6%] w-7 h-7 text-primary/[0.06] rotate-[-25deg]" />
          <PawPrint className="absolute top-20 right-[10%] w-8 h-8 text-primary/[0.05] rotate-[20deg]" />
          <PawPrint className="absolute bottom-16 right-[8%] w-6 h-6 text-primary/[0.04] rotate-[35deg]" />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto mb-16"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary uppercase tracking-wider">
                <Star className="w-4 h-4" /> Quest Log{" "}
                <Star className="w-4 h-4" />
              </span>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-foreground mt-3">
                Your adventure{" "}
                <span className="text-gradient">begins here.</span>
              </h2>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto relative">
              <div className="hidden md:block absolute top-1/2 left-[18%] right-[18%] h-0.5 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 -translate-y-1/2 z-0" />

              {quests.map((quest, i) => (
                <motion.a
                  key={quest.step}
                  href={i === 0 ? "/portrait" : "/gaming"}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -8, transition: { duration: 0.25 } }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="relative z-10 bg-card border border-border rounded-2xl p-6 group hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
                >
                  <span
                    className={`absolute -top-3 right-4 text-[10px] font-display font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                      quest.status === "EPIC"
                        ? "bg-gradient-to-r from-primary to-warm-dark text-primary-foreground"
                        : "bg-secondary text-primary"
                    }`}
                  >
                    {quest.status}
                  </span>

                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="w-14 h-14 rounded-xl bg-warm-light flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300"
                  >
                    <quest.icon className="w-6 h-6 text-primary group-hover:text-primary-foreground transition-colors duration-300" />
                  </motion.div>

                  <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Quest {quest.step} · {quest.subtitle}
                  </p>
                  <h3 className="font-display font-bold text-xl text-foreground mb-2">
                    {quest.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                    {quest.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 bg-warm-light text-primary px-3 py-1 rounded-full text-xs font-display font-bold">
                      <Star className="w-3 h-3 fill-primary" />
                      {quest.reward}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
                  </div>
                </motion.a>
              ))}
            </div>
          </div>
        </section>

        <section
          className="py-24 bg-background relative overflow-hidden"
          id="faq"
        >
          <PawPrint className="absolute top-10 left-[8%] w-7 h-7 text-primary/[0.05] rotate-[-15deg]" />
          <PawPrint className="absolute bottom-14 right-[7%] w-8 h-8 text-primary/[0.04] rotate-[18deg]" />
          <Whiskers className="absolute top-[35%] right-[3%] w-16 h-6 text-primary/[0.06]" />

          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto mb-16"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary uppercase tracking-wider">
                <PawPrint className="w-4 h-4 text-primary/70" />
                FAQ
              </span>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-foreground mt-3">
                Got questions?
              </h2>
              <p className="text-muted-foreground mt-4 text-lg">
                Everything you need to know about Token Tails.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto space-y-3"
            >
              {faqs.map((faq, index) => {
                const isOpen = openFaqIndex === index;
                return (
                  <div
                    key={faq.question}
                    className={`bg-card border rounded-2xl px-6 transition-all duration-300 ${
                      isOpen
                        ? "border-primary/30 shadow-md shadow-primary/5"
                        : "border-border hover:border-primary/20"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                      className="w-full py-5 flex items-center justify-between gap-4 font-display font-semibold text-left text-foreground"
                      aria-expanded={isOpen}
                      aria-controls={`faq-${index}`}
                    >
                      <span>{faq.question}</span>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p
                        id={`faq-${index}`}
                        className="text-muted-foreground leading-relaxed pb-5"
                      >
                        {faq.answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </div>
        </section>

        <section className="py-32 bg-charcoal relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px]" />
          </div>

          <PawPrint className="absolute top-16 left-[8%] w-10 h-10 text-primary-foreground/[0.04] rotate-[-20deg]" />
          <PawPrint className="absolute top-28 right-[12%] w-8 h-8 text-primary-foreground/[0.03] rotate-[15deg]" />
          <PawPrint className="absolute bottom-20 left-[15%] w-7 h-7 text-primary-foreground/[0.04] rotate-[30deg]" />
          <PawPrint className="absolute bottom-16 right-[10%] w-9 h-9 text-primary-foreground/[0.03] rotate-[-25deg]" />
          <Whiskers className="absolute top-[40%] left-[3%] w-24 h-10 text-primary-foreground/[0.04] rotate-[-5deg]" />
          <Whiskers className="absolute bottom-[35%] right-[3%] w-20 h-8 text-primary-foreground/[0.03] rotate-[5deg]" />

          <motion.img
            src="/mascots/actions/gaming_with_a_controller.webp"
            alt=""
            aria-hidden="true"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="hidden md:block absolute bottom-0 left-[6%] w-48 xl:w-64 drop-shadow-2xl pointer-events-none select-none"
          />
          <motion.img
            src="/mascots/emotions/lovelable.webp"
            alt=""
            aria-hidden="true"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="hidden md:block absolute bottom-0 right-[6%] w-48 xl:w-64 drop-shadow-2xl pointer-events-none select-none"
          />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-3xl mx-auto"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 200 }}
                className="inline-flex items-center gap-2 bg-primary/20 border border-primary/30 text-primary px-4 py-2 rounded-full text-sm font-display font-bold mb-6"
              >
                <img
                  src="/logo/stellar-logo-white.webp"
                  alt="Stellar"
                  className="h-4 w-auto"
                />
                Powered by Stellar
              </motion.div>
              <h2 className="font-display font-bold text-5xl md:text-6xl text-primary-foreground leading-tight">
                Help us build the
                <br />
                future of feline care.
              </h2>
              <p className="text-primary-foreground/60 mt-5 text-lg max-w-xl mx-auto">
                10K+ cat parents are already with us. Five apps are on the way.
                All on Stellar. All funding shelters. Start with a portrait
                or explore the full family.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <motion.a
                  whileHover={{
                    scale: 1.07,
                    boxShadow: "0 0 50px hsl(28 92% 53% / 0.3)",
                  }}
                  whileTap={{ scale: 0.96 }}
                  href="/portrait"
                  className="portrait-btn-primary inline-flex items-center justify-center px-10 py-4 text-lg font-bold"
                >
                  Create Portrait Now
                </motion.a>
                <motion.a
                  whileHover={{
                    scale: 1.05,
                    borderColor: "rgba(255,255,255,0.4)",
                  }}
                  whileTap={{ scale: 0.96 }}
                  href="#family"
                  className="portrait-btn-dark inline-flex items-center justify-center px-8 py-4 text-lg font-bold"
                >
                  Explore the app family
                </motion.a>
              </div>
            </motion.div>
          </div>
        </section>

        <footer className="bg-charcoal border-t border-primary-foreground/10 py-12">
          <div className="container mx-auto px-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <img
                  src={ASSETS.logo}
                  alt="Token Tails"
                  className="h-6 w-auto"
                />
              </div>

              <div className="flex items-center gap-6 flex-wrap justify-center">
                <a
                  href="https://x.com/tokentails"
                  className="text-primary-foreground/50 hover:text-primary-foreground text-sm transition-colors"
                >
                  Twitter
                </a>
                <a
                  href="https://instagram.com/tokentails"
                  className="text-primary-foreground/50 hover:text-primary-foreground text-sm transition-colors"
                >
                  Instagram
                </a>
                <a
                  href="https://tiktok.com/@tokentails"
                  className="text-primary-foreground/50 hover:text-primary-foreground text-sm transition-colors"
                >
                  TikTok
                </a>
                <a
                  href="https://discord.gg/4FVYmnd7Hg"
                  className="text-primary-foreground/50 hover:text-primary-foreground text-sm transition-colors"
                >
                  Discord
                </a>
                <a
                  href="https://t.me/+ofyPNIfNX5w4ZjM8"
                  className="text-primary-foreground/50 hover:text-primary-foreground text-sm transition-colors"
                >
                  Telegram
                </a>
              </div>

              <p className="text-primary-foreground/30 text-sm">
                © {currentYear} Token Tails. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
