import Link from 'next/link';
import { PropsWithChildren } from 'react';

interface IProps {
    className?: string;
    onClick?: () => void;
    href?: string;
}

export const OptionalLink = ({ className, onClick, href, children }: PropsWithChildren<IProps>) => {
    if (href) {
        return (
            <Link className={className || ''} href={`/${href}`.replace('//', '/')} onClick={onClick}>
                {children}
            </Link>
        );
    }
    return (
        <button onClick={onClick} className={className}>
            {children}
        </button>
    );
};
