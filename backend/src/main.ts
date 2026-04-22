import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { json, raw } from 'express';
import { AppModule } from './app.module';
dotenv.config();

function initializeCors(app: INestApplication): void {
    const corsOptions: CorsOptions = {
        origin: [
            'http://localhost',
            'capacitor://localhost',
            'http://localhost:3000',
            'http://localhost:3001',
            'https://cats.tokentails.com',
            'https://test.tokentails.com',
            'https://tokentails.com',
            ...(process.env.FRONT_END_URLS?.split(',') || ['*']),
        ],
        credentials: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        exposedHeaders: [
            'Accept',
            'authorization',
            'Content-Type',
            'If-None-Match',
            'SourceType',
            'content-disposition',
        ],
    };

    app.enableCors(corsOptions);
}

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { rawBody: true });
    initializeCors(app);

    // Apply raw body middleware for webhook route BEFORE JSON middleware
    // This ensures the raw body is preserved for Stripe signature verification
    app.use(
        '/image/webhook',
        raw({
            type: 'application/json',
            verify: (req: any, res, buf) => {
                // Store raw body in request for Stripe webhook verification
                if (Buffer.isBuffer(buf)) {
                    req.rawBody = buf;
                }
                return true;
            },
        })
    );

    // Apply JSON parser for all other routes
    app.use(json({ limit: '50mb' }));

    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.listen(process.env.PORT || 3005);
    // await app.listen(process.env.PORT || 3005, '0.0.0.0');
}
bootstrap();
