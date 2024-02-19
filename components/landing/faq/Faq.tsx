import React, { useState } from "react";

interface IProps {
  title: string;
  description: string;
  isActive?: boolean;
  onSet?: () => void;
}

const sections: IProps[] = [
  {
    title: "Are there any costs associated with Skillmatrix?",
    description:
      "We offer initial courses for free. Advanced courses needs to be bought as NFT. Users can also opt to receive certificates upon completing learning paths, which are issued for a fee as NFTs.",
  },
  {
    title:
      "How does Skillmatrix stay current with the rapidly changing crypto world?",
    description:
      "Our platform continually updates its courses to reflect the latest trends and developments, ensuring that learners always have access to current and relevant information.",
  },
  {
    title: "How does Skillmatrix make learning fun?",
    description:
      "By integrating RPG learnplay. Enroll into courses quests, participate in mini-games with your Roadmap character, fight in quizes with your own HP that will be refreshed each day, unlock new courses, play Crypto Wars and accomplish your goals !",
  },
  {
    title: "How can I get involved with SkillMatrix?",
    description:
      "We're looking for investors, partners, and users who share our vision for transforming crypto education. If you're interested in contributing to or participating in the SkillMatrix project, please contact us via provided social media or by email",
  },
];

const FaqSection = ({ title, description, isActive, onSet }: IProps) => {
  return (
    <div>
      <button
        onClick={() => onSet?.()}
        className="flex relative z-10 w-full justify-between border-b title items-center py-4 px-5 font-bold transition"
      >
        <div className="text-left title">{title}</div>
        <span
          className={`h-8 w-8 shrink-0 fill-accent-100 transition ${
            isActive ? "rotate-[-180deg]" : ""
          }`}
        >
          <svg viewBox="0 0 64 64">
            <path d="M63.029,42.285l-13.08-7.848c-0.175,4.299-0.787,8.26-1.494,11.562H64v-2   C64,43.297,63.632,42.646,63.029,42.285z" />
            <path d="M46.905,52H62c1.104,0,2-0.896,2-2v-2H47.999C47.625,49.537,47.245,50.889,46.905,52z" />
            <path d="M14.051,34.438l-13.08,7.848C0.368,42.646,0,43.297,0,44v2h15.545   C14.839,42.697,14.226,38.737,14.051,34.438z" />
            <path d="M0,48v2c0,1.104,0.896,2,2,2h15.095c-0.34-1.111-0.72-2.463-1.093-4H0z" />
            <path d="M32,64c2.06,0,4.239-2.343,4.837-6h-9.672C27.763,61.656,29.94,64,32,64z" />
            <path d="M33.109,0.336C32.773,0.112,32.387,0,32,0s-0.773,0.112-1.109,0.336C23.692,5.135,16,15.974,16,32   c0,4.399,0.516,8.508,1.181,12h29.639C47.484,40.508,48,36.399,48,32C48,15.974,40.308,5.135,33.109,0.336z M32,30   c-3.313,0-6-2.687-6-6s2.687-6,6-6s6,2.687,6,6S35.313,30,32,30z" />
            <circle cx="32" cy="24" r="4" />
            <path d="M20.143,54.742C20.447,55.502,21.183,56,22,56h20c0.817,0,1.553-0.498,1.857-1.258   c0.097-0.24,1.427-3.62,2.554-8.742H17.589C18.716,51.122,20.046,54.502,20.143,54.742z" />
          </svg>
        </span>
      </button>
      <div
        className={`text-p4 transition relative z-0 py-4 px-5 border-b ${
          isActive ? "" : "hidden"
        }`}
      >
        {description}
      </div>
    </div>
  );
};

export const Faq = () => {
  const [active, setActive] = useState(sections[0]);

  return (
    <div className="min-h-screen relative flex items-center">
      <div className="container flex flex-col md:flex-row gap-12">
        <h2 className="flex-1 mb-6 pl-6 text-h5 md:text-h3 font-bold title text-accent-100">
          Frequently asked questions
        </h2>
        <div className="flex-1">
          {sections.map((section, index) => (
            <FaqSection
              key={index}
              title={section.title}
              description={section.description}
              isActive={section.title === active.title}
              onSet={() => setActive(section)}
            />
          ))}

          <h2 className="mt-12 text-center text-h6 font-bold title text-accent-100">
            Contact us
          </h2>
          <div className="flex flex-col justify-center items-center my-8 gap-2">
            <img
              className="w-24 animate-border"
              src="/icons/social/founder.jpg"
            />
            <div className="title font-bold text-p4">
              Žygimantas Bagdzevicius
            </div>

            <div className="text-p6 text-center uppercase bg-accent-900 w-fit px-8 py-2 rounded-full title font-bold">
              Founder & CTO
            </div>
          </div>
          <div className="flex gap-8 justify-center">
            <a
              target="_blank"
              href="https://linkedin.com/in/zygimantas-bagdzevicius"
            >
              <img className="w-12" src="/icons/social/linkedin.png" />
            </a>
            <a
              target="_blank"
              href="https://instagram.com/zygimantas.bagdzevicius"
            >
              <img className="w-12" src="/icons/social/instagram.png" />
            </a>
            <a target="_blank" href="https://warpcast.com/skillmatrix">
              <img className="w-12" src="/icons/social/warpcast.png" />
            </a>
            <a target="_blank" href="mailto:zygimantas@skillmatrix.app">
              <img className="w-12" src="/icons/social/email.png" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
