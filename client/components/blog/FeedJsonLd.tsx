import { ldJson } from "@/lib/feed/jsonld";
import { isApp } from "@/models/app";
import Head from "next/head";

/** JSON-LD blocks as direct `<Head>` children, keyed so client navigation replaces them. */
export const FeedJsonLd = ({ items }: { items: (Record<string, unknown> | null)[] }) => (
  <Head>
    {items
      .filter((x): x is Record<string, unknown> => !!x)
      .map((data, i) => (
        <script key={`feed-ld-${i}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(data) }} />
      ))}
    {/* The RSS file is written after the web build only. */}
    {!isApp && <link key="feed-rss" rel="alternate" type="application/rss+xml" title="Token Tails Blog" href="/feed/rss.xml" />}
  </Head>
);
