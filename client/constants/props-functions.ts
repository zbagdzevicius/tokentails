import { isApp } from "@/models/app";

// Static export (app builds) cannot revalidate, so ISR is web-only.
export async function getAppStaticProps<T extends object>(
  dataFetchCallback?: () => T
): Promise<{ props: Partial<Awaited<T>>, revalidate?: number }> {
  return {
    props: {
      ...(dataFetchCallback ? await dataFetchCallback() : {}),
    },
    ...(isApp ? {} : { revalidate: 3600 }),
  };
}

// Dynamic routes are rendered on demand on the web. A static export has no
// server to do that, so app builds emit no paths and link to the
// query-param client routes instead (see catPath and articlePath).
export async function getAppStaticPaths() {
  return {
    paths: [],
    fallback: isApp ? (false as const) : ("blocking" as const),
  };
}
