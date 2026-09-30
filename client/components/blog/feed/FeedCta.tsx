import { ReactNode } from "react";

const categoryCtaComponentMap: Record<string, ReactNode> = {
    default: <></>,
};

export const FeedCta = ({ category }: { category?: string }) => {
    return categoryCtaComponentMap[category || 'default'] || [];
};
