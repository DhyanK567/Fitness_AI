import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

async function bootstrap() {
  // Fail fast if dev-only flags are enabled outside development
  const devFlags = ['AUTH_DEV_AUTO_VERIFY', 'ALLOW_DEV_TENANT_HEADER'];
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development') {
    for (const flag of devFlags) {
      const value = process.env[flag];
      if (value && value !== 'false' && value !== '0') {
        throw new Error(`[SECURITY] ${flag} is enabled in ${nodeEnv}. This is only allowed in development (NODE_ENV=development).`);
      }
    }
  }

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  const bodyLimit = process.env.REQUEST_BODY_LIMIT ?? '256kb';
  app.use(json({ limit: bodyLimit, verify: (request: Request & { rawBody?: Buffer }, _response, buffer) => { request.rawBody = Buffer.from(buffer); } }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  // Request ID middleware (must be first to attach request ID)
  const requestIdMiddleware = app.get(RequestIdMiddleware);
  app.use((req: Request, res: Response, next: NextFunction) => requestIdMiddleware.use(req, res, next));

  // Global pipes
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));

  // Global interceptors and filters
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());

  // Global rate limiting
  const rateLimitGuard = app.get(RateLimitGuard);
  app.useGlobalGuards(rateLimitGuard);

  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set(configuredOrigins);
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:3000');
    allowedOrigins.add('http://localhost:3001');
    allowedOrigins.add('http://127.0.0.1:3001');
  }

  app.enableCors({
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      if (process.env.NODE_ENV !== 'production') {
        const cleanOrigin = origin.replace(/\/+$/, '');
        if (
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin) ||
          /^http:\/\/([a-z0-9-]+\.)*fitness\.local(:\d+)?$/i.test(cleanOrigin)
        ) {
          return callback(null, true);
        }
      }
      return callback(null, false);
    },
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
