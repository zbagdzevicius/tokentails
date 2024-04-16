import classNames from "classnames";

export const Avatar = ({
  avatar,
  size = "small",
}: {
  avatar?: string;
  size?: "small" | "big" | "full";
}) => {
  const avatarSrc = avatar;
  return (
    <>
      {!!avatarSrc ? (
        <img
          className={classNames("", {
            "w-16 h-16": size === "big",
            "w-7 h-7": size === "small",
            "w-full h-full": size === "full",
          })}
          alt="avatar"
          src={avatarSrc}
        />
      ) : (
        <div
          className={classNames(
            "bx bxs-user-circle text-primary",
            {
              "text-h5": ["small", "full"].includes(size),
              "text-h2": size === "big",
            }
          )}
        ></div>
      )}
    </>
  );
};
