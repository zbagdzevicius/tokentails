import { FEED_OPTION } from "@/constants/api";
import classnames from "classnames";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";

export const SidebarItem = ({
  href,
  notificationsCount,
  className,
  name,
  onClick,
}: {
  href?: string;
  notificationsCount?: number;
  className?: string;
  name: string;
  onClick?: () => void;
}) => {
  const router = useRouter();
  const isActive = useMemo(
    () => router.asPath.split("/")?.[1] === (href?.replace("/", "") || ""),
    [router.asPath, href]
  );

  return (
    <Link
      href={href || "/"}
      onClick={onClick}
      className={classnames(
        "flex items-center overflow-hidden space-x-2 rem:h-[52px] rounded-md hover:bg-purple-300 rounded-lg transition-all",
        {
          "bg-gray-200": isActive,
          [className || ""]: className,
        }
      )}
    >
      <div className="flex items-center space-x-2 px-2 hover:purple-300 rounded-lg transition-all text-gray-600">
        <span className="w-10 h-10 text-h6 rounded-full grid place-items-center bg-gray-300">
          <img src="/logo/coin.webp" />
        </span>
      </div>
      <div className="text-p2">{name}</div>
    </Link>
  );
};

export const Sidebar = () => {
  return (
    <div className="col-span-1 h-full hidden lg:flex flex-col gap-4 sticky top-36 md:basis-[150px] xl:basis-[260px] 2xl:basis-[360px] shrink-0 transition-animation">
      <SidebarItem {...FEED_OPTION.ARTICLES_CATS_NFT} />
      <SidebarItem {...FEED_OPTION.ARTICLES_ANNOUNCEMENTS} />
      <SidebarItem {...FEED_OPTION.ARTICLES_ALL_ABOUT_CATS} />
    </div>
  );
};
