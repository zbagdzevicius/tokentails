import { DynamicModule, Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FIREBASE_ADMIN_INJECT, FIREBASE_ADMIN_MODULE_OPTIONS } from './strategies/constants';

@Global()
@Module({})
export class FirebaseAdminModule {
    static forRoot(options: admin.AppOptions): DynamicModule {
        const firebaseAdminModuleOptions = {
            provide: FIREBASE_ADMIN_MODULE_OPTIONS,
            useValue: options,
        };

        const app = admin.apps?.length
            ? admin.apps[0]
            : admin.initializeApp({ credential: admin.credential.cert(options) });

        const firebaseAuthencationProvider = {
            provide: FIREBASE_ADMIN_INJECT,
            useValue: app,
        };

        return {
            module: FirebaseAdminModule,
            providers: [firebaseAdminModuleOptions, firebaseAuthencationProvider],
            exports: [firebaseAdminModuleOptions, firebaseAuthencationProvider],
        };
    }
}
