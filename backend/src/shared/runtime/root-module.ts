import type { Type } from '@nestjs/common';
import type { BackendRole } from './backend-role';

/**
 * The root module for a role. Loaded lazily so the relay process never imports app.module.ts (and so never builds the
 * Firebase Admin app, the crons or the hot-wallet providers declared there).
 */
export async function rootModuleFor(role: BackendRole): Promise<Type<unknown>> {
    if (role === 'relay') return (await import('../../relay.module')).RelayModule;
    const app = await import('../../app.module');
    return role === 'api' ? app.ApiAppModule : app.AppModule;
}
