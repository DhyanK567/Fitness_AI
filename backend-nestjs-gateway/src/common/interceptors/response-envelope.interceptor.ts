import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

export interface ResponseEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  request_id: string;
}

@Injectable()
export class ResponseEnvelopeInterceptor<T>
  implements NestInterceptor<T, ResponseEnvelope<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T>> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'] as string || uuidv4();

    return next.handle().pipe(
      map((data: T) => data instanceof StreamableFile
        ? data as unknown as ResponseEnvelope<T>
        : {
            success: true,
            data,
            request_id: requestId,
          }),
    );
  }
}
