
export async function getAppStaticProps<T>(
  dataFetchCallback?: () => T
): Promise<{ props: any, revalidate?: number }> {
  return {
    props: {
      ...(dataFetchCallback ? await dataFetchCallback() : {}),
    },
    revalidate: 3600
  };
}

