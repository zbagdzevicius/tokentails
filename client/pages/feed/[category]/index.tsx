import {
  FeedLanding,
  LandingPageProps,
} from "@/components/blog/feed/FeedLanding";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import BlogLayout from "@/layouts/BlogLayout";
import { WebPageJsonLd } from "next-seo";
import { useRouter } from "next/router";

export default function Category(landingPageProps: LandingPageProps) {
  const {
    query: { category },
  } = useRouter() as unknown as { query: { category: string } };

  return (
    <>
      <SeoHead
        name={category}
        description={`${process.env.NEXT_PUBLIC_SITE_NAME} - ${category} straipsniai`}
        page={`/${category}`}
      />

      <WebPageJsonLd
        description={`${process.env.NEXT_PUBLIC_DOMAIN} - ${category} straipsniai`}
        id={`${process.env.NEXT_PUBLIC_DOMAIN!}/${category}`}
      />

      <FirebaseAuthProvider>
        <BlogLayout>
          <FeedLanding
            category={category}
            hasCategory={true}
            {...landingPageProps}
          />
        </BlogLayout>
      </FirebaseAuthProvider>
    </>
  );
}
