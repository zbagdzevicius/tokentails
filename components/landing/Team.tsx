import { cdnFile } from "@/constants/utils";
import { PixelButton } from "../shared/PixelButton";

interface ISocial {
  img: string;
  link: string;
}

interface ITeamMember {
  img: string;
  name: string;
  role: string;
  socials: ISocial[];
}

export const SocialImages = {
  LINKEDIN: cdnFile("icons/social/linkedin.png"),
  INSTAGRAM: cdnFile("icons/social/instagram.png"),
  X: cdnFile("icons/social/x.webp"),
  WARPCAST: cdnFile("icons/social/warpcast.png"),
  EMAIL: cdnFile("icons/social/email.png"),
  TELEGRAM: cdnFile("icons/social/telegram.png"),
};

const teamMembers: ITeamMember[] = [
  {
    img: cdnFile("team/zygimantas.webp"),
    name: "Žygimantas",
    role: "Founder, CTO",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://linkedin.com/in/zygimantas-bagdzevicius",
      },
      {
        img: SocialImages.X,
        link: "https://x.com/zbagdz",
      },
      {
        img: SocialImages.INSTAGRAM,
        link: "https://instagram.com/zygimantas.bagdzevicius",
      },
    ],
  },
  {
    img: cdnFile("team/arturas.webp"),
    name: "Artūras",
    role: "AI Engineer",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/art%C5%ABras-dr%C5%ABteika-34309b195/",
      },
    ],
  },
  {
    img: cdnFile("team/feta.webp"),
    name: "Feta",
    role: "Vibe Checker",
    socials: [
      {
        img: SocialImages.EMAIL,
        link: "https://media.tenor.com/Y3bJsdez11QAAAAj/cute-spin-cute-bubu.gif",
      },
    ],
  },
  {
    img: cdnFile("team/ernest.webp"),
    name: "Ernest",
    role: "Game Lead",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/ernest-rimkevi%C4%8Dius-0785a521a",
      },
    ],
  },
  {
    img: cdnFile("team/sky.webp"),
    name: "Sky Wee",
    role: "BD",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/skywee97/",
      },
      {
        img: SocialImages.X,
        link: "https://x.com/Officialskywee1",
      },
      {
        img: SocialImages.INSTAGRAM,
        link: "https://www.instagram.com/skywee97",
      },
      {
        img: SocialImages.EMAIL,
        link: "https://councils.forbes.com/profile/Sky-Wee-Managing-Partner-VC-Crypto-Influencer-Strategic-Advisor-Sky-Ventures/950ed4a7-2f34-4b69-a936-cf301062f115",
      },
    ],
  },
  {
    img: cdnFile("team/lukas.webp"),
    name: "Lukas",
    role: "Web Lead",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/lukas-kveraga",
      },
    ],
  },
  {
    img: cdnFile("team/domas.webp"),
    name: "Domas",
    role: "Graphics",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/igor-plusa/",
      },
    ],
  },
  {
    img: cdnFile("team/kaciukas.webp"),
    name: "Kačiukas",
    role: "Nap Lead",
    socials: [
      {
        img: SocialImages.EMAIL,
        link: "https://media.tenor.com/Y3bJsdez11QAAAAj/cute-spin-cute-bubu.gif",
      },
    ],
  },
  {
    img: cdnFile("team/marcin.webp"),
    name: "Marcin",
    role: "Legal",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/marcinkolago/",
      },
      {
        img: SocialImages.EMAIL,
        link: "https://grow3.ai",
      },
    ],
  },
  {
    img: cdnFile("team/igor.webp"),
    name: "Igor",
    role: "Marketing",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/igor-plusa/",
      },
      {
        img: SocialImages.EMAIL,
        link: "https://grow3.ai",
      },
    ],
  },
];

const TeamMember = ({ img, name, role, socials }: ITeamMember) => {
  return (
    <div className="text-center hover:brightness-125">
      <img
        draggable={false}
        className="mx-auto mb-2 w-36 h-36 object-contain"
        src={img}
        alt={name}
      />
      <h3 className="text-p3 md:text-p3 font-secondary">{name}</h3>
      <p className="w-fit m-auto text-primary">{role}</p>
      <ul className="flex justify-center mt-2 space-x-4">
        {socials.map((social) => (
          <a key={social.link} target="_blank" href={social.link}>
            <img className="w-5" src={social.img} draggable="false" />
          </a>
        ))}
      </ul>
    </div>
  );
};

export const Team = () => {
  return (
    <div className="container h-full flex flex-col items-center justify-center">
      <a href="/game" className="flex justify-center">
        <PixelButton text="PLAY HERE" />
      </a>

      <h2 className="font-primary uppercase tracking-tight text-h3 md:text-h2 lg:text-h1 text-balance text-center my-3">
        United To Save Cats
      </h2>
      <div className="pb-8 px-4 mx-auto max-w-screen-xl text-center lg:px-6">
        <div className="grid gap-8 grid-cols-2 md:grid-cols-5">
          {teamMembers.map((teamMember) => (
            <TeamMember key={teamMember.name} {...teamMember} />
          ))}
        </div>
      </div>
    </div>
  );
};
