import { FeedLanding } from "@/components/blog/feed/FeedLanding";
import { SeoHead } from "@/components/seo/SeoHead";
import BlogLayout from "@/layouts/BlogLayout";
import { WebPageJsonLd } from "next-seo";

function BlogLanding() {
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
      <BlogLayout>
        <FeedLanding />
      </BlogLayout>
    </div>
  );
}

export default BlogLanding;
