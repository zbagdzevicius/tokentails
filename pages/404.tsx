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
            <NoMore />
        </div>
    );
};

export default Custom404;
