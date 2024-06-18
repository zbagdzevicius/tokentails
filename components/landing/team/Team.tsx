import React from "react";

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

enum SocialImages {
  LINKEDIN = "/icons/social/linkedin.png",
  INSTAGRAM = "/icons/social/instagram.png",
  X = "/icons/social/x.webp",
  WARPCAST = "/icons/social/warpcast.png",
  EMAIL = "/icons/social/email.png",
}

const teamMembers: ITeamMember[] = [
  {
    img: "/team/zygimantas.webp",
    name: "Žygimantas Bagdzevičius",
    role: "Founder | CTO",
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
    img: "/team/eligijus.webp",
    name: "Eligijus Lipskis",
    role: "Web3 Lead",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/eligijus-lipskis-b20ab692/",
      },
    ],
  },
  {
    img: "/team/matt.webp",
    name: "Matt Bankauskas",
    role: "CMO",
    socials: [
      {
        img: SocialImages.EMAIL,
        link: "https://www.kolhq.com/",
      },
    ],
  },
  {
    img: "/team/krishna.webp",
    name: "Krishna Meruva",
    role: "Marketing Lead",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/krishna-meruva/",
      },
    ],
  },
  {
    img: "/team/ernest.webp",
    name: "Ernest Rimkevičius",
    role: "Developer",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/ernest-rimkevi%C4%8Dius-0785a521a",
      },
    ],
  },
  {
    img: "/team/lukas.webp",
    name: "Lukas Kveraga",
    role: "Engineer",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/lukas-kveraga",
      },
    ],
  },
  {
    img: "/team/andrius.webp",
    name: "Andrius Žiužnys",
    role: "Copywriter",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/andriusziuznys/",
      },
    ],
  },
  {
    img: "/team/domas.webp",
    name: "Domas Grašys",
    role: "UI expert",
    socials: [
      {
        img: SocialImages.LINKEDIN,
        link: "https://www.linkedin.com/in/igor-plusa/",
      },
    ],
  },
  {
    img: "/team/marcin.webp",
    name: "Marcin Kolago",
    role: "Advisor",
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
    name: "Igor Plusa",
    role: "Advisor",
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
    <div className="text-center">
      <img className="mx-auto mb-4 w-36 h-36 object-contain" src={img} alt={name} />
      <h3 className="mb-1 text-p3 md:text-p3 font-secondary">{name}</h3>
      <p className="px-2 rounded-full animate-border w-fit m-auto text-white">
        {role}
      </p>
      <ul className="flex justify-center mt-4 space-x-4">
        {socials.map((social) => (
          <a key={social.link} target="_blank" href={social.link}>
            <img className="w-5" src={social.img} draggable="false" />
          </a>
        ))}
      </ul>
    </div>
  );
};

const Team = () => {
  return (
    <div className="py-8 px-4 mx-auto max-w-screen-xl text-center lg:py-16 lg:px-6">
      <div className="grid gap-8 grid-cols-2 md:grid-cols-5">
        {teamMembers.map((teamMember) => (
          <TeamMember key={teamMember.name} {...teamMember} />
        ))}
      </div>
    </div>
  );
};

export default Team;
