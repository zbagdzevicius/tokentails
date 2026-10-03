import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { request as httpRequest } from 'http';
import { AddressInfo } from 'net';
import { goldenLog } from './heist-test-logs.helper-spec';
import { applyBodyParsers, LIVE_GAME_PATH } from './live-body-limit';

/*
 * The body parsers as main.ts registers them, on a real HTTP server (plan F6: a 64 KB route parser
 * for /live before the global 50 MB one). Supertest is not a dependency, so the spec talks HTTP
 * with Node's own client.
 */

@Controller()
class EchoController {
    @Post('user/catbassadors/live')
    live(@Body() body: unknown) {
        return { size: JSON.stringify(body).length };
    }

    @Post('other')
    other(@Body() body: unknown) {
        return { size: JSON.stringify(body).length };
    }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

function post(
    app: INestApplication,
    path: string,
    payload: string,
    contentType = 'application/json'
): Promise<{ status: number; body: any }> {
    const { port } = app.getHttpServer().address() as AddressInfo;
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            {
                host: '127.0.0.1',
                port,
                path,
                method: 'POST',
                headers: { 'content-type': contentType, 'content-length': Buffer.byteLength(payload) },
            },
            res => {
                let text = '';
                res.setEncoding('utf8');
                res.on('data', chunk => (text += chunk));
                res.on('end', () => {
                    let body: any = text;
                    try {
                        body = JSON.parse(text);
                    } catch {
                        // non-JSON body
                    }
                    resolve({ status: res.statusCode || 0, body });
                });
            }
        );
        req.on('error', reject);
        req.end(payload);
    });
}

const bodyOfSize = (bytes: number) => {
    const shell = JSON.stringify({ type: 'CATNIP_HEIST', pad: '' });
    return JSON.stringify({ type: 'CATNIP_HEIST', pad: 'x'.repeat(Math.max(0, bytes - shell.length)) });
};

describe('body limits (main.ts applyBodyParsers)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        app = await NestFactory.create(EchoModule, { logger: false, rawBody: true });
        applyBodyParsers(app);
        await app.listen(0, '127.0.0.1');
    });

    afterAll(async () => {
        await app?.close();
    });

    it('serves /live at the path the route parser is mounted on', () => {
        expect(LIVE_GAME_PATH).toBe('/user/catbassadors/live');
    });

    it('accepts a /live body just under 64 KB and a golden Heist save', async () => {
        const under = await post(app, LIVE_GAME_PATH, bodyOfSize(64 * 1024 - 16));
        expect(under.status).toBe(201);
        const golden = JSON.stringify({ type: 'CATNIP_HEIST', replay: goldenLog('heist-08') });
        expect(Buffer.byteLength(golden)).toBeLessThan(8 * 1024);
        expect((await post(app, LIVE_GAME_PATH, golden)).status).toBe(201);
    });

    it('answers a /live body over 64 KB with 413 and a JSON error, before the handler', async () => {
        const over = await post(app, LIVE_GAME_PATH, bodyOfSize(64 * 1024 + 16));
        expect(over.status).toBe(413);
        expect(over.body).toMatchObject({ statusCode: 413, error: 'Payload Too Large' });
    });

    it('keeps the global limit for every other route (1 MB still parses)', async () => {
        const big = await post(app, '/other', bodyOfSize(1024 * 1024));
        expect(big.status).toBe(201);
        expect(big.body.size).toBeGreaterThan(1000000);
    });

    it('answers a non-JSON /live body with 415 before any parser (urlencoded would allow 100 KB)', async () => {
        const form = `type=CATNIP_HEIST&pad=${'x'.repeat(90 * 1024)}`;
        const urlencoded = await post(app, LIVE_GAME_PATH, form, 'application/x-www-form-urlencoded');
        expect(urlencoded.status).toBe(415);
        expect(urlencoded.body).toMatchObject({ statusCode: 415, error: 'Unsupported Media Type' });
        expect((await post(app, LIVE_GAME_PATH, 'hello', 'text/plain')).status).toBe(415);
        // Express mounts are case-insensitive, like Nest's routing.
        expect((await post(app, '/User/Catbassadors/Live/', form, 'application/x-www-form-urlencoded')).status).toBe(
            415
        );
    });

    it('still accepts JSON with a charset, and leaves other routes alone', async () => {
        const body = JSON.stringify({ type: 'CATNIP_CHAOS', points: 1 });
        expect((await post(app, LIVE_GAME_PATH, body, 'application/json; charset=utf-8')).status).toBe(201);
        expect((await post(app, '/other', 'a=1', 'application/x-www-form-urlencoded')).status).toBe(201);
    });
});
