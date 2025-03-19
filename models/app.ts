// export const isProd = true;
export const isProd = process.env.NEXT_PUBLIC_IS_PROD === "true";
export const isApp = process.env.NEXT_PUBLIC_IS_APP === "true";
