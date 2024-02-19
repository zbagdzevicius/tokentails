import { Faq } from "@/components/landing/faq/Faq";
import Head from "next/head";

export default function Index() {
  return (
    <>
      <Head>
        <title>
          Skillmatrix - Where learning crypto is as fun as your favorite game
        </title>
        <meta property="og:image" content="/images/logo.jpg" />
        <meta
          property="og:title"
          content="Skillmatrix - Where learning crypto is as fun as your favorite game"
          key="title"
        />
        <meta
          name="description"
          content="SkillMatrix dApp revolutionizes crypto education by combining interactive learning, gamification, and community engagement"
        />
        <link rel="shortcut icon" href="/images/logo.jpg" />
      </Head>
      <span id="faq" className="pt-8 pb-32">
        <Faq />
      </span>
    </>
  );
}
