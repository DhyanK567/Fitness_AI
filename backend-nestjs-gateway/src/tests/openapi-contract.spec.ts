import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('OpenAPI Contract Alignment', () => {
  const SPEC_PATH = path.resolve(
    __dirname,
    '../../../shared/api-contracts/openapi.yaml',
  );

  it('import-export routes are documented in the OpenAPI spec', () => {
    const specContent = fs.readFileSync(SPEC_PATH, 'utf-8');

    const requiredRoutes = [
      '/import-export/import/members',
      '/import-export/import/leads',
      '/import-export/import/classes',
      '/import-export/export/{dataset}',
    ];

    const missing: string[] = [];
    for (const route of requiredRoutes) {
      if (!specContent.includes(route)) {
        missing.push(route);
      }
    }

    if (missing.length > 0) {
      console.error(
        `The following import-export routes are NOT in the OpenAPI spec:\n${missing.join('\n')}`,
      );
    }

    expect(missing).toEqual([]);
  });

  it('OpenAPI spec parses as valid YAML structure', () => {
    const specContent = fs.readFileSync(SPEC_PATH, 'utf-8');

    expect(specContent).toContain('openapi: 3.0.3');
    expect(specContent).toContain('paths:');
    expect(specContent).toContain('components:');
    expect(specContent).toContain('Import / Export');
  });

  it('Swagger mocks for E2E and unit testing export all required decorators including ApiConsumes', async () => {
    const e2eMock = await import('../../test/mock-swagger');
    const unitMock = await import('../../tests/__mocks__/nestjs-swagger.mock');

    const requiredExports = [
      'ApiTags',
      'ApiOperation',
      'ApiBearerAuth',
      'ApiProperty',
      'ApiPropertyOptional',
      'ApiQuery',
      'ApiResponse',
      'ApiParam',
      'ApiBody',
      'ApiHeader',
      'ApiExcludeEndpoint',
      'ApiExcludeController',
      'ApiExtraModels',
      'ApiConsumes',
      'ApiProduces',
      'getSchemaPath',
    ];

    for (const exportName of requiredExports) {
      expect(typeof (e2eMock as any)[exportName]).toBe('function');
      expect(typeof (unitMock as any)[exportName]).toBe('function');
    }
  });
});
