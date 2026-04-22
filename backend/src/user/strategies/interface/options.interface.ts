export interface AppAuthStrategyOptions {
    extractor: (arg: any) => string;
    checkRevoked?: boolean;
}
