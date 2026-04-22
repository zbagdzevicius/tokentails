

const categoryCtaComponentMap: any = {
    default: <></>,
};

export const FeedCta = ({ category }: { category?: string }) => {
    return categoryCtaComponentMap[category || 'default'] || [];
};
