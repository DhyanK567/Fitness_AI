// Mock for @nestjs/swagger to avoid ESM issues in Jest
export const ApiTags = (...args: string[]) => (target: any) => target;
export const ApiOperation = (options?: any) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const ApiBearerAuth = (...args: string[]) => (target: any) => target;
export const ApiQuery = (options?: any) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const ApiResponse = (options?: any) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const ApiBody = (options?: any) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const ApiParam = (options?: any) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const ApiProperty = (options?: any) => (target: any, propertyKey: string) => {};
export const ApiPropertyOptional = (options?: any) => (target: any, propertyKey: string) => {};
export const ApiExtraModels = (...models: any[]) => (target: any) => target;
export const ApiHeader = (options?: any) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const ApiExcludeEndpoint = () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const ApiExcludeController = () => (target: any) => target;
export const ApiConsumes = (...mimeTypes: string[]) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const ApiProduces = (...mimeTypes: string[]) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const getSchemaPath = (model: any, property?: string) => property ? `${model.name}/${property}` : model.name;