export interface ITicket {
  _id?: string;
  message: string;
  answer: string;
  user: {
    twitter: string;
    email: string;
    spent: number;
  };
}
