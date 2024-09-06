export type IStatusValue = 0 | 1 | 2 | 3 | 4 | number
export interface IStatus {
  status: IStatusValue;
  type: StatusType;
}

export enum StatusType {
  EAT = 'EAT',
  PLAY = 'PLAY',
}

export const typeImages: Record<StatusType, string> = {
  [StatusType.EAT]: "logo/rocket.png",
  [StatusType.PLAY]: "logo/paw.png",
};

export const statusTypeLabels: Record<StatusType, string> = {
  [StatusType.EAT]: "energy",
  [StatusType.PLAY]: "joy",
}