import {
  ArgumentMetadata,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  PipeTransform,
  Type,
} from '@nestjs/common';
import { SCHEMA_METADATA_KEY } from '../constants';
import type {
  StandardSchemaV1,
  StandardValidationPipeOptions,
} from '../interfaces';

/**
 * Validation pipe that uses Standard Schema for validation
 *
 * @example
 * // Route-level usage with schema
 * @Post()
 * create(@Body(new StandardValidationPipe(CreateUserSchema)) body: CreateUserDto) {}
 *
 * @example
 * // Global usage (requires @Schema decorator or createStandardDto)
 * app.useGlobalPipes(new StandardValidationPipe());
 */
@Injectable()
export class StandardValidationPipe<T = unknown> implements PipeTransform<T> {
  private readonly schema?: StandardSchemaV1<unknown, T>;
  private readonly options: StandardValidationPipeOptions;

  constructor(
    schemaOrOptions?:
      | StandardSchemaV1<unknown, T>
      | StandardValidationPipeOptions,
    options?: StandardValidationPipeOptions,
  ) {
    if (this.isSchema(schemaOrOptions)) {
      this.schema = schemaOrOptions;
      this.options = options ?? {};
    } else {
      this.schema = undefined;
      this.options = schemaOrOptions ?? {};
    }
  }

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<T> {
    const schema = this.getSchema(metadata);

    if (!schema) {
      return value as T;
    }

    const result = await Promise.resolve(schema['~standard'].validate(value));

    if ('issues' in result && result.issues) {
      throw this.createException(result.issues);
    }

    return result.value as T;
  }

  private getSchema(metadata: ArgumentMetadata): StandardSchemaV1 | undefined {
    if (this.schema) {
      return this.schema;
    }

    // Skip validation for custom decorators unless explicitly enabled
    if (metadata.type === 'custom' && !this.options.validateCustomDecorators) {
      return undefined;
    }

    const { metatype } = metadata;
    const expectedType = this.options.expectedType ?? metatype;

    if (!expectedType || this.isPrimitive(expectedType)) {
      return undefined;
    }

    return this.getSchemaFromType(expectedType);
  }

  private getSchemaFromType(type: Type<unknown>): StandardSchemaV1 | undefined {
    // Check for static schema property (from createStandardDto)
    const typeWithSchema = type as Type<unknown> & {
      schema?: StandardSchemaV1;
    };

    if (typeWithSchema.schema) {
      return typeWithSchema.schema;
    }

    // Check for @Schema decorator metadata
    return Reflect.getMetadata(SCHEMA_METADATA_KEY, type);
  }

  private createException(
    issues: ReadonlyArray<StandardSchemaV1.Issue>,
  ): HttpException {
    if (this.options.exceptionFactory) {
      const exception = this.options.exceptionFactory([...issues]);
      if (exception instanceof HttpException) {
        return exception;
      }
      return new BadRequestException(exception);
    }

    const statusCode =
      this.options.errorHttpStatusCode ?? HttpStatus.BAD_REQUEST;

    return new HttpException(
      {
        statusCode,
        message: 'Validation failed',
        errors: issues.map((issue) => ({
          path: this.normalizePath(issue.path),
          message: issue.message,
        })),
      },
      statusCode,
    );
  }

  private normalizePath(path: StandardSchemaV1.Issue['path']): PropertyKey[] {
    if (!path) return [];
    return path.map((segment) =>
      typeof segment === 'object' && 'key' in segment ? segment.key : segment,
    );
  }

  private isPrimitive(type: Type<unknown>): boolean {
    const primitives: Type<unknown>[] = [
      String,
      Boolean,
      Number,
      Array,
      Object,
    ];
    return primitives.includes(type);
  }

  private isSchema(value: unknown): value is StandardSchemaV1<unknown, T> {
    return (
      typeof value === 'object' &&
      value !== null &&
      '~standard' in value &&
      typeof (value as StandardSchemaV1)['~standard'] === 'object'
    );
  }
}
