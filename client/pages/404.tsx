import { SeoHead } from '@/components/seo/SeoHead';
import { NoMore } from '@/components/shared/NoMore';
const Custom404 = () => {
    return (
        <div>
            <SeoHead
                name={`${process.env.NEXT_PUBLIC_SITE_NAME} - your page went meow`}
                description={`${process.env.NEXT_PUBLIC_SITE_NAME} - in this meowgical place we haven't found your page`}
                page={`${process.env.NEXT_PUBLIC_SITE_NAME} - your page went meow`}
            />
            {/* 404 is outside the night sky scope but sits on the global night background, so it sets
                its own night ink (task 3d review: the inherited yellow-900 measured 2.26:1). */}
            <NoMore tone="night" />
        </div>
    );
};

export default Custom404;
