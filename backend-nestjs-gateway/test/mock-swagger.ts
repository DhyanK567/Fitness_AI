export function ApiTags() { return () => {}; }
export function ApiOperation() { return () => {}; }
export function ApiBearerAuth() { return () => {}; }
export function ApiProperty() { return () => {}; }
export function ApiPropertyOptional() { return () => {}; }
export function ApiQuery() { return () => {}; }
export function ApiResponse() { return () => {}; }
export function ApiParam() { return () => {}; }
export function ApiBody() { return () => {}; }
export function ApiHeader() { return () => {}; }
export function ApiExcludeEndpoint() { return () => {}; }
export function ApiExcludeController() { return () => {}; }
export function ApiExtraModels() { return () => {}; }
export function ApiExtension() { return () => {}; }
export function ApiConsumes(...args: any[]) { return () => {}; }
export function ApiProduces(...args: any[]) { return () => {}; }
export function getSchemaPath(model: any, property?: string) { return property ? `${model?.name || model}/${property}` : (model?.name || model); }
export class DocumentBuilder { 
  setTitle() { return this; }
  setDescription() { return this; }
  setVersion() { return this; }
  addBearerAuth() { return this; }
  build() { return {}; }
}
export function SwaggerModule() {
  return {
    createDocument: () => ({}),
    setup: () => {}
  }
}
