import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ErrorCode } from '@fitness-ai/error-codes';

const HTTP_STATUS_TO_ERROR_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.AUTH_EXPIRED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
  500: ErrorCode.INTERNAL_ERROR,
  502: ErrorCode.ERP_UNAVAILABLE,
  503: ErrorCode.SERVICE_UNAVAILABLE,
  504: ErrorCode.ERP_UNAVAILABLE,
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = request.headers['x-request-id'] as string || uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'An unexpected error occurred';
    let details: Record<string, unknown> | undefined;
    let mfaTicket: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exception.message;
        // Prefer explicit errorCode from exception response; fall back to status mapping
        errorCode = (resp.errorCode as ErrorCode) || HTTP_STATUS_TO_ERROR_CODE[status] || ErrorCode.INTERNAL_ERROR;
        details = resp.details as Record<string, unknown>;
        mfaTicket = typeof resp.mfaTicket === 'string' ? resp.mfaTicket : undefined;
      } else {
        message = exception.message;
        errorCode = HTTP_STATUS_TO_ERROR_CODE[status] || ErrorCode.INTERNAL_ERROR;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const retryAfter = typeof details?.retry_after === 'number' || typeof details?.retry_after === 'string'
        ? String(details.retry_after)
        : '60';
      response.setHeader('Retry-After', retryAfter);
    }

    response.setHeader('X-Request-ID', requestId);

    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message,
        details,
        ...(mfaTicket ? { mfaTicket } : {}),
      },
      request_id: requestId,
    });
  }
}
