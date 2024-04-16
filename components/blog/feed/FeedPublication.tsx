import { IPublication as Props } from "@/models/publication";
import { FeedCard } from "./FeedCard";
import { EntityType } from "@/models/save";
import { useMemo } from "react";
import { EntityRouteOption } from "@/constants/api";

export const FeedPublication = ({
  _id,
  user,
  content,
  slug,
  ...rest
}: Props) => {
  const avatarSrc = user.avatar;
  const link = useMemo(
    () => EntityRouteOption.PUBLICATION.details([slug]),
    [slug]
  );

  return (
    <FeedCard
      entity={_id}
      description={content}
      author={user.name}
      authorImage={avatarSrc}
      authorSubtitle="Community Post"
      authorLink={link}
      date={new Date().toString()}
      link={link}
      type={EntityType.PUBLICATION}
      {...rest}
    ></FeedCard>
  );
};
