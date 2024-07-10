import { useLaunchParams, useInitData, User } from "@telegram-apps/sdk-react";
import React, { ReactNode, useMemo } from "react";

export type IDisplayDataRow = { title: string } & (
  | { type: "link"; value?: string }
  | { value: ReactNode }
);

function getUserRows(user: User): IDisplayDataRow[] {
  return [
    { title: "id", value: user.id.toString() },
    { title: "username", value: user.username },
    { title: "photo_url", value: user.photoUrl },
    { title: "last_name", value: user.lastName },
    { title: "first_name", value: user.firstName },
    { title: "is_bot", value: user.isBot },
    { title: "is_premium", value: user.isPremium },
    { title: "language_code", value: user.languageCode },
    { title: "allows_to_write_to_pm", value: user.allowsWriteToPm },
    { title: "added_to_attachment_menu", value: user.addedToAttachmentMenu },
  ];
}

export const CatbassadorsAuth = () => {
  const launchParams = useLaunchParams(true);
  const initData = useInitData(true);

  const initDataRows = useMemo<IDisplayDataRow[] | undefined>(() => {
    if (!initData || !launchParams?.initDataRaw) {
      return;
    }
    const {
      hash,
      queryId,
      chatType,
      chatInstance,
      authDate,
      startParam,
      canSendAfter,
      canSendAfterDate,
    } = initData;
    return [
      { title: "raw", value: launchParams.initDataRaw },
      { title: "auth_date", value: authDate.toLocaleString() },
      { title: "auth_date (raw)", value: authDate.getTime() / 1000 },
      { title: "hash", value: hash },
      { title: "can_send_after", value: canSendAfterDate?.toISOString() },
      { title: "can_send_after (raw)", value: canSendAfter },
      { title: "query_id", value: queryId },
      { title: "start_param", value: startParam },
      { title: "chat_type", value: chatType },
      { title: "chat_instance", value: chatInstance },
    ];
  }, [initData, launchParams]);
  const userRows = useMemo<IDisplayDataRow[] | undefined>(() => {
    return initData && initData.user ? getUserRows(initData.user) : undefined;
  }, [initData]);

  const receiverRows = useMemo<IDisplayDataRow[] | undefined>(() => {
    return initData && initData.receiver
      ? getUserRows(initData.receiver)
      : undefined;
  }, [initData]);

  const chatRows = useMemo<IDisplayDataRow[] | undefined>(() => {
    console.log({initData});
    if (!initData?.chat) {
      return;
    }
    const { id, title, type, username, photoUrl } = initData.chat;

    return [
      { title: "id", value: id.toString() },
      { title: "title", value: title },
      { title: "type", value: type },
      { title: "username", value: username },
      { title: "photo_url", value: photoUrl },
    ];
  }, [initData]);

  if (!initDataRows) {
    return (
      <img
        alt="Telegram sticker"
        src="https://xelene.me/telegram.gif"
        style={{ display: "block", width: "144px", height: "144px" }}
      />
    );
  }

  return (
    <div>works
      {userRows?.map((v) => (
        <p key={v.title}>
          {v.title} - {v.value}
        </p>
      ))}
    </div>
  );
};
