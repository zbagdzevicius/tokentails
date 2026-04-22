import { FeedLanding } from "@/components/blog/feed/FeedLanding";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import BlogLayout from "@/layouts/BlogLayout";
import { WebPageJsonLd } from "next-seo";
import { useEffect, useState } from "react";

function BlogLanding() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <></>;
  }

  return (
    <div className="relative">
      <SeoHead
        name={"Tokentails.com - Play to save"}
        description={"Token Tails news"}
        page={""}
      />
      <WebPageJsonLd
        description="tokentails.com"
        id={process.env.NEXT_PUBLIC_DOMAIN!}
      />

      <FirebaseAuthProvider>
        <BlogLayout>
          <FeedLanding />
        </BlogLayout>
      </FirebaseAuthProvider>
    </div>
  );
}

export default BlogLanding;
