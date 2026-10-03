import { INestApplication } from '@nestjs/common';
import { json, NextFunction, raw, Request, Response } from 'express';
import { LIVE_GAME_BODY_LIMIT } from '../dto/live-game.dto';

/** The score route (`UserController.Tcatbassadors`). No global prefix is set in main.ts. */
export const LIVE_GAME_PATH = '/user/catbassadors/live';

/** Every other JSON body. An existing, very loose limit: a known issue (plan F6), not changed here. */
export const GLOBAL_JSON_BODY_LIMIT = '50mb';

/** A request that carries a body (the `type-is` rule body-parser uses). */
const hasBody = (req: Request) =>
    req.headers['transfer-encoding'] !== undefined ||
    !Number.isNaN(parseInt(String(req.headers['content-length']), 10));

/** 415 for a body on the score route that is not JSON; a body-less request goes on (and fails validation). */
export function rejectNonJsonBody(req: Request, res: Response, next: NextFunction): void {
    if (hasBody(req) && !req.is('application/json')) {
        res.status(415).json({
            statusCode: 415,
            message: 'Content-Type must be application/json',
            error: 'Unsupported Media Type',
        });
        return;
    }
    next();
}

/**
 * Registers the body parsers in the order they must run (call before `app.listen`):
 *
 * 1. `/image/webhook`: raw body for the Stripe signature check.
 * 2. `POST /user/catbassadors/live`: JSON up to 64 KB (plan F6). A larger body is 413 with a JSON
 *    error, before any guard, pipe or replay. Registered before the global parser, which then skips
 *    the already-parsed request (body-parser leaves a request alone once `req._body` is set).
 *    A body of any other content type is 415 there, unparsed: Nest's default urlencoded parser
 *    (100 KB) would otherwise still parse it, past the 64 KB bound.
 * 3. Everything else: JSON up to 50 MB.
 *
 * Nest's own parsers are added later, at init, and skip parsed requests the same way.
 */
export function applyBodyParsers(app: INestApplication): void {
    app.use(
        '/image/webhook',
        raw({
            type: 'application/json',
            verify: (req: any, _res, buf) => {
                // Store raw body in request for Stripe webhook verification
                if (Buffer.isBuffer(buf)) {
                    req.rawBody = buf;
                }
                return true;
            },
        })
    );

    app.use(LIVE_GAME_PATH, json({ limit: LIVE_GAME_BODY_LIMIT }));
    // Error handler for the route parser only: body-parser reports `entity.too.large` with status 413.
    app.use(LIVE_GAME_PATH, (error: any, _req: Request, res: Response, next: NextFunction) => {
        if (error?.type === 'entity.too.large' || error?.status === 413) {
            res.status(413).json({
                statusCode: 413,
                message: `Body over ${LIVE_GAME_BODY_LIMIT}`,
                error: 'Payload Too Large',
            });
            return;
        }
        next(error);
    });

    app.use(LIVE_GAME_PATH, rejectNonJsonBody);

    app.use(json({ limit: GLOBAL_JSON_BODY_LIMIT }));
}
