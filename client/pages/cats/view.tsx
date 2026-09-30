import { CAT_API } from "@/api/cat-api";
import { CatDetailsLayout } from "@/components/marketplace/CatDetailsLayout";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import { useRouter } from "next/router";

// Client-rendered cat detail for the static app export, which cannot serve
// /cats/[cat]. Links reach it through catPath() in api/routing.ts.
export default function CatView() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";

  const { data: cat } = useQuery({
    queryKey: ["cat", id],
    queryFn: () => CAT_API.cat(id),
    enabled: !!id,
  });

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <CatDetailsLayout cat={cat ?? null} />
    </>
  );
}
