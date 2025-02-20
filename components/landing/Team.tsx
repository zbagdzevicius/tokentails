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

export enum SocialImages {
  LINKEDIN = "/icons/social/linkedin.png",
  INSTAGRAM = "/icons/social/instagram.png",
  X = "/icons/social/x.webp",
  WARPCAST = "/icons/social/warpcast.png",
  EMAIL = "/icons/social/email.png",
  TELEGRAM = "/icons/social/telegram.png",
}

const teamMembers: ITeamMember[] = [
  {
    img: "/team/zygimantas.webp",
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
      {
        img: SocialImages.WARPCAST,
        link: "https://warpcast.com/skillmatrix",
      },
    ],
  },
  {
    img: "/team/krishna.webp",
    name: "Krishna",
    role: "Marketing Lead",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/krishna-meruva/",
      },
    ],
  },
  {
    img: "/team/feta.webp",
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
    img: "/team/ernest.webp",
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
    img: "/team/sky.webp",
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
    img: "/team/lukas.webp",
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
    img: "/team/domas.webp",
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
    img: "/team/kaciukas.webp",
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
    img: "/team/marcin.webp",
    name: "Marcin",
    role: "BD Advisor",
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
    img: "/team/igor.webp",
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
      <h2 className="mt-12 text-center font-secondary uppercase tracking-tight text-h2 text-balance max-lg:text-h6 my-3">
        United To Save Cats
      </h2>
      <div className="py-8 px-4 mx-auto max-w-screen-xl text-center lg:py-10 lg:px-6">
        <div className="grid gap-8 grid-cols-2 md:grid-cols-5">
          {teamMembers.map((teamMember) => (
            <TeamMember key={teamMember.name} {...teamMember} />
          ))}
        </div>
      </div>
    </div>
  );
};
