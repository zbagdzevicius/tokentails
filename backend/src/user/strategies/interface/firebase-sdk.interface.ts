import * as admin from 'firebase-admin';
import { ModuleMetadata } from '@nestjs/common/interfaces';

export type FirebaseAdminSDK = admin.app.App;

export type FirebaseUser = admin.auth.DecodedIdToken;

export interface FirebaseAdminModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    name?: string;
    useFactory?: (...args: any[]) => Promise<admin.AppOptions> | admin.AppOptions;
    inject?: any[];
}
