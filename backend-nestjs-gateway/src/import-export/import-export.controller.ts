import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query,
  Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ErrorCode } from '@fitness-ai/error-codes';
import type { RequestWithContext } from '../common/request-context.types';
import { RequirePermission } from '../common/permission.decorator';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { formatDatasetCsv, parseStudioCsvRecords } from './csv-parser';
import { ExportDataset, ExportQueryDto } from './dto/export-query.dto';
import { ImportBodyDto } from './dto/import-body.dto';
import { IMPORT_EXPORT_PERMISSIONS } from './import-export.policy';
import { ImportExportService } from './import-export.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const csvUpload = FileInterceptor('file', { limits: { files: 1, fileSize: MAX_FILE_SIZE } });

function requestContext(req: RequestWithContext) {
  return {
    tenantId: req.tenantId as string,
    tenantCode: req.tenantCode as string,
    correlationId: req.correlationId as string,
  };
}

function importRows(file: any, body: ImportBodyDto | undefined): Array<Record<string, unknown>> {
  if (file) {
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException({
        message: `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)} MB limit`,
        errorCode: ErrorCode.VALIDATION_ERROR,
      });
    }
    const name = String(file.originalname ?? '').toLowerCase();
    const mime = String(file.mimetype ?? '').toLowerCase();
    if (name && !name.endsWith('.csv') && !mime.includes('csv') && mime !== 'text/plain') {
      throw new BadRequestException('Only CSV files are supported.');
    }
    return parseStudioCsvRecords(file.buffer.toString('utf8'));
  }
  if (typeof body?.rawCsv === 'string' && body.rawCsv.trim()) return parseStudioCsvRecords(body.rawCsv);
  if (Array.isArray(body?.rows)) return body.rows;
  throw new BadRequestException({
    message: 'Provide a CSV file, rawCsv text, or a JSON rows array',
    errorCode: ErrorCode.VALIDATION_ERROR,
  });
}

@ApiTags('Import / Export')
@ApiBearerAuth()
@UseGuards(TenantContextGuard, StaffAccessGuard)
@Controller('import-export')
export class ImportExportController {
  constructor(private readonly importExport: ImportExportService) {}

  private args(req: RequestWithContext, file: any, body: ImportBodyDto | undefined) {
    return {
      context: requestContext(req),
      rows: importRows(file, body),
      actorId: req.auth?.userId as string,
      dryRun: body?.dryRun === true || body?.dryRun === 'true',
      idempotencyKey: req.headers['idempotency-key'] as string | undefined,
      duplicatePolicy: body?.duplicatePolicy === 'update' ? 'update' as const : 'skip' as const,
    };
  }

  @Post('import/members')
  @UseInterceptors(csvUpload)
  @ApiOperation({ summary: 'Validate or import members from CSV or JSON rows' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.import)
  importMembers(@Req() req: RequestWithContext, @UploadedFile() file: any, @Body() body: ImportBodyDto) {
    const a = this.args(req, file, body);
    return this.importExport.importMembers(a.context, a.rows, a.actorId, a.dryRun, a.idempotencyKey, a.duplicatePolicy);
  }

  @Post('import/leads')
  @UseInterceptors(csvUpload)
  @ApiOperation({ summary: 'Validate or import leads from CSV or JSON rows' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.import)
  importLeads(@Req() req: RequestWithContext, @UploadedFile() file: any, @Body() body: ImportBodyDto) {
    const a = this.args(req, file, body);
    return this.importExport.importLeads(a.context, a.rows, a.actorId, a.dryRun, a.idempotencyKey, a.duplicatePolicy);
  }

  @Post('import/classes')
  @UseInterceptors(csvUpload)
  @ApiOperation({ summary: 'Validate or import class schedules from CSV or JSON rows' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.import)
  importClasses(@Req() req: RequestWithContext, @UploadedFile() file: any, @Body() body: ImportBodyDto) {
    const roles = req.auth?.roles ?? [];
    if (roles.includes('front_desk') && !roles.some((role) => role === 'owner' || role === 'admin')) {
      throw new ForbiddenException('Front desk users cannot import class schedules.');
    }
    const a = this.args(req, file, body);
    return this.importExport.importClasses(a.context, a.rows, a.actorId, a.dryRun, a.idempotencyKey, a.duplicatePolicy);
  }

  @Post('import/memberships')
  @UseInterceptors(csvUpload)
  @ApiOperation({ summary: 'Validate or import memberships from CSV or JSON rows' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.import)
  importMemberships(@Req() req: RequestWithContext, @UploadedFile() file: any, @Body() body: ImportBodyDto) {
    const a = this.args(req, file, body);
    return this.importExport.importMemberships(a.context, a.rows, a.actorId, a.dryRun, a.idempotencyKey, a.duplicatePolicy);
  }

  @Post('import/bookings')
  @UseInterceptors(csvUpload)
  @ApiOperation({ summary: 'Validate or import bookings from CSV or JSON rows' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.import)
  importBookings(@Req() req: RequestWithContext, @UploadedFile() file: any, @Body() body: ImportBodyDto) {
    const a = this.args(req, file, body);
    return this.importExport.importBookings(a.context, a.rows, a.actorId, a.dryRun, a.idempotencyKey, a.duplicatePolicy);
  }

  @Post('import/attendance')
  @UseInterceptors(csvUpload)
  @ApiOperation({ summary: 'Validate or import attendance from CSV or JSON rows' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.import)
  importAttendance(@Req() req: RequestWithContext, @UploadedFile() file: any, @Body() body: ImportBodyDto) {
    const a = this.args(req, file, body);
    return this.importExport.importAttendance(a.context, a.rows, a.actorId, a.dryRun, a.idempotencyKey, a.duplicatePolicy);
  }

  @Post('import/payments')
  @UseInterceptors(csvUpload)
  @ApiOperation({ summary: 'Validate or import payments from CSV or JSON rows' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.import)
  importPayments(@Req() req: RequestWithContext, @UploadedFile() file: any, @Body() body: ImportBodyDto) {
    const a = this.args(req, file, body);
    return this.importExport.importPayments(a.context, a.rows, a.actorId, a.dryRun, a.idempotencyKey, a.duplicatePolicy);
  }

  @Post('import/events')
  @UseInterceptors(csvUpload)
  @ApiOperation({ summary: 'Validate or import events from CSV or JSON rows' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.import)
  importEvents(@Req() req: RequestWithContext, @UploadedFile() file: any, @Body() body: ImportBodyDto) {
    const a = this.args(req, file, body);
    return this.importExport.importEvents(a.context, a.rows, a.actorId, a.dryRun, a.idempotencyKey, a.duplicatePolicy);
  }

  @Get('export/:dataset')
  @ApiOperation({ summary: 'Export a tenant dataset as JSON or RFC-4180 CSV' })
  @RequirePermission(IMPORT_EXPORT_PERMISSIONS.export)
  async exportDataset(
    @Req() req: RequestWithContext,
    @Query() query: ExportQueryDto,
    @Param('dataset') dataset: ExportDataset,
    @Res({ passthrough: true }) response?: Response,
  ): Promise<any> {
    const result = await this.importExport.exportDataset(
      requestContext(req),
      { ...query, dataset },
      req.auth?.userId as string,
    );
    if (query.format !== 'csv') return result;
    const csv = formatDatasetCsv(dataset, result.data);
    response?.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response?.setHeader('Content-Disposition', `attachment; filename="${dataset}-${new Date().toISOString().slice(0, 10)}.csv"`);
    response?.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(Buffer.from(`\uFEFF${csv}`, 'utf8'));
  }
}
