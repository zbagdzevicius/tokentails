import { CAT_API } from "@/api/cat-api";
import { CatDetailsLayout } from "@/components/marketplace/CatDetailsLayout";
import {
  getAppStaticPaths,
  getAppStaticProps,
} from "@/constants/props-functions";
import { ICat } from "@/models/cats";
import { GetStaticPropsContext } from "next";

interface Props {
  cat: ICat | null;
}

export default function CatPage({ cat }: Props) {
  return <CatDetailsLayout cat={cat} />;
}

async function fetchProps(slug: string): Promise<Props> {
  const cat = await CAT_API.cat(slug);

  return { cat };
}

export const getStaticProps = async (
  params: GetStaticPropsContext<{ cat: string }>
) =>
  getAppStaticProps<Promise<Props>>(() => fetchProps(params.params!.cat));

export const getStaticPaths = getAppStaticPaths;
