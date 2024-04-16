import { saveProfile } from "@/constants/api";
import { randomNumber } from "@/constants/utils";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useMutation } from "@tanstack/react-query";
import classNames from "classnames";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";

const generateAvatarDigits = () => randomNumber(1, 47474747);

export const ProfileAvatar = () => {
  const { profile, setProfile, deleteProfile } = useFirebaseAuth();
  const [avatar, setAvatar] = useState("");
  const [name, setName] = useState("-");
  const [isConfirmedToDeleteAccount, setIsConfirmedToDeleteAccount] =
    useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isPending) {
      setName(event?.target?.value);
    }
  };

  const isAvatarDiffers = useMemo(() => {
    return profile?.avatar !== avatar;
  }, [profile, avatar]);

  const isDiffers = useMemo(() => {
    return profile?.avatar !== avatar || profile?.name !== name;
  }, [profile, avatar, name]);

  const { mutate, isPending } = useMutation({
    mutationFn: saveProfile,
    onSuccess: (data) => {
      setProfile({ name, avatar });
    },
  });

  useEffect(() => {
    if (profile) {
      setAvatar(profile.avatar);
      setName(profile.name);
    }
  }, [profile, setAvatar, setName]);

  const updateAvatar = () => {
    setAvatar(generateAvatarDigits()?.toString());
  };

  const resetAvatar = () => {
    setAvatar(profile?.avatar || "");
  };

  if (!profile) {
    return <></>;
  }

  return (
    <div className="flex flex-col gap-4 transition-animation">
      <h2>Vardas</h2>

      <input
        autoFocus={true}
        type="text"
        disabled={isPending}
        placeholder="Vardas"
        className={classNames(
          "bg-primary-100 relative p2 px-4 h-8 md:h-10 rounded-full flex items-center justify-center",
          {
            "animate-pulse": isPending,
          }
        )}
        onChange={handleChange}
        value={name}
      />
      <h2>Avataras</h2>
      <div className="flex gap-4">
        <Avatar avatar={avatar} size="big" />
        <button onClick={() => updateAvatar()}>
          <span>Keisti</span>
        </button>
        {isAvatarDiffers && (
          <button onClick={() => resetAvatar()}>
            <span>Atstatyti</span>
          </button>
        )}
      </div>
      {isDiffers && (
        <button onClick={() => mutate({ name, avatar })}>
          <span>Išsaugoti Pakeitimus</span>
        </button>
      )}
      {!isConfirmedToDeleteAccount && (
        <button
          onClick={() => setIsConfirmedToDeleteAccount(true)}
          className="bg-red-800 flex justify-center items-center text-white h-8 rounded-lg"
        >
          <span className="bx bx-x-circle mr-2 text-p1"></span> Ištrinti Paskyrą
        </button>
      )}
      {isConfirmedToDeleteAccount && (
        <button
          onClick={() => deleteProfile()}
          className="bg-red-800 justify-center items-center flex text-white h-8 rounded-lg px-4"
        >
          <span className="bx bxs-trash-alt mr-2 text-p1"></span> Patvirtinti
          paskyros ištrinimą
        </button>
      )}
    </div>
  );
};
