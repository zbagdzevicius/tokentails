export interface IResponse<T = undefined> {
    success: boolean;
    message?: string;
    data?: T;
}

export const RESPONSES = {
    success: { success: true },
};
