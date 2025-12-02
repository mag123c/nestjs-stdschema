import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Controller, Post, Body, Get, Module, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  SwaggerModule,
  DocumentBuilder,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import * as v from 'valibot';
import { createStandardDto, StandardValidationPipe } from '../../src';

// ============================================
// Test Schemas and DTOs
// ============================================

// Zod Schema with OpenAPI via toJSONSchema (Zod v4 style mock)
const CreateUserZodSchema = z.object({
  name: z.string().min(1).describe('User name'),
  email: z.string().email().describe('User email address'),
  age: z.number().int().positive().optional().describe('User age'),
});

class CreateUserZodDto extends createStandardDto(CreateUserZodSchema) {}

// Valibot Schema with manual OpenAPI metadata
const CreateUserValibotSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  email: v.pipe(v.string(), v.email()),
  age: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

class CreateUserValibotDto extends createStandardDto(CreateUserValibotSchema, {
  openapi: {
    name: { type: 'string', minLength: 1, description: 'User name', example: 'John Doe' },
    email: { type: 'string', format: 'email', description: 'User email', example: 'john@example.com' },
    age: { type: 'integer', minimum: 1, description: 'User age', required: false },
  },
}) {}

// Response DTO
const UserResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

class UserResponseDto extends createStandardDto(UserResponseSchema, {
  openapi: {
    id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
    name: { type: 'string', example: 'John Doe' },
    email: { type: 'string', format: 'email', example: 'john@example.com' },
    createdAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
  },
}) {}

// ============================================
// Test Controllers with Swagger Decorators
// ============================================

@Controller('api/users')
class UserController {
  @Post()
  @ApiBody({ type: CreateUserValibotDto })
  @ApiResponse({ status: 201, type: UserResponseDto, description: 'User created successfully' })
  createUser(@Body(new StandardValidationPipe(CreateUserValibotSchema)) body: CreateUserValibotDto) {
    return {
      id: '550e8400-e29b-41d4-a716-446655440000',
      ...body,
      createdAt: new Date().toISOString(),
    };
  }

  @Get()
  @ApiResponse({ status: 200, type: [UserResponseDto], description: 'List of users' })
  getUsers() {
    return [];
  }
}

@Controller('api/products')
class ProductController {
  @Post()
  @ApiBody({ type: CreateUserZodDto })
  createProduct(@Body(new StandardValidationPipe(CreateUserZodSchema)) body: CreateUserZodDto) {
    return { id: '1', ...body };
  }
}

// ============================================
// Test Module
// ============================================

@Module({
  controllers: [UserController, ProductController],
})
class TestModule {}

// ============================================
// Swagger E2E Tests
// ============================================

describe('Swagger/OpenAPI E2E Integration', () => {
  let app: INestApplication;
  let swaggerDocument: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();

    // Setup Swagger
    const config = new DocumentBuilder()
      .setTitle('Test API')
      .setDescription('API for testing nestjs-stdschema Swagger integration')
      .setVersion('1.0')
      .build();

    swaggerDocument = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, swaggerDocument);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('OpenAPI Document Generation', () => {
    it('should generate valid OpenAPI 3.0 document', () => {
      expect(swaggerDocument.openapi).toMatch(/^3\./);
      expect(swaggerDocument.info.title).toBe('Test API');
      expect(swaggerDocument.info.version).toBe('1.0');
    });

    it('should have paths defined', () => {
      expect(swaggerDocument.paths).toBeDefined();
      expect(Object.keys(swaggerDocument.paths).length).toBeGreaterThan(0);
    });

    it('should include /api/users endpoint', () => {
      expect(swaggerDocument.paths['/api/users']).toBeDefined();
      expect(swaggerDocument.paths['/api/users'].post).toBeDefined();
      expect(swaggerDocument.paths['/api/users'].get).toBeDefined();
    });

    it('should include /api/products endpoint', () => {
      expect(swaggerDocument.paths['/api/products']).toBeDefined();
      expect(swaggerDocument.paths['/api/products'].post).toBeDefined();
    });
  });

  describe('DTO _OPENAPI_METADATA_FACTORY Integration', () => {
    it('CreateUserValibotDto should have _OPENAPI_METADATA_FACTORY', () => {
      expect(typeof CreateUserValibotDto._OPENAPI_METADATA_FACTORY).toBe('function');
    });

    it('CreateUserValibotDto should return OpenAPI metadata', () => {
      const metadata = CreateUserValibotDto._OPENAPI_METADATA_FACTORY();

      expect(metadata).toBeDefined();
      expect(metadata.name).toMatchObject({
        type: 'string',
        minLength: 1,
        description: 'User name',
      });
      expect(metadata.email).toMatchObject({
        type: 'string',
        format: 'email',
      });
      expect(metadata.age).toMatchObject({
        type: 'integer',
        minimum: 1,
        required: false,
      });
    });

    it('UserResponseDto should have correct OpenAPI metadata', () => {
      const metadata = UserResponseDto._OPENAPI_METADATA_FACTORY();

      expect(metadata).toBeDefined();
      expect(metadata.id).toMatchObject({
        type: 'string',
        format: 'uuid',
      });
      expect(metadata.email).toMatchObject({
        type: 'string',
        format: 'email',
      });
      expect(metadata.createdAt).toMatchObject({
        type: 'string',
        format: 'date-time',
      });
    });
  });

  describe('Schema Property Exposure', () => {
    it('DTO should expose static schema property', () => {
      expect(CreateUserValibotDto.schema).toBe(CreateUserValibotSchema);
      expect(CreateUserZodDto.schema).toBe(CreateUserZodSchema);
      expect(UserResponseDto.schema).toBe(UserResponseSchema);
    });

    it('Schema should be a valid Standard Schema', () => {
      // Check Valibot schema
      expect(CreateUserValibotDto.schema['~standard']).toBeDefined();
      expect(typeof CreateUserValibotDto.schema['~standard'].validate).toBe('function');

      // Check Zod schema
      expect(CreateUserZodDto.schema['~standard']).toBeDefined();
      expect(typeof CreateUserZodDto.schema['~standard'].validate).toBe('function');
    });
  });

  describe('Request Body Schema in OpenAPI', () => {
    it('POST /api/users should have request body schema', () => {
      const postOperation = swaggerDocument.paths['/api/users'].post;
      expect(postOperation.requestBody).toBeDefined();
    });

    it('POST /api/products should have request body schema', () => {
      const postOperation = swaggerDocument.paths['/api/products'].post;
      expect(postOperation.requestBody).toBeDefined();
    });
  });

  describe('Response Schema in OpenAPI', () => {
    it('POST /api/users should have 201 response', () => {
      const postOperation = swaggerDocument.paths['/api/users'].post;
      expect(postOperation.responses['201']).toBeDefined();
      expect(postOperation.responses['201'].description).toBe('User created successfully');
    });

    it('GET /api/users should have 200 response', () => {
      const getOperation = swaggerDocument.paths['/api/users'].get;
      expect(getOperation.responses['200']).toBeDefined();
      expect(getOperation.responses['200'].description).toBe('List of users');
    });
  });

  describe('Components/Schemas', () => {
    it('should have schemas defined in components', () => {
      // SwaggerModule generates schemas based on DTOs used
      expect(swaggerDocument.components).toBeDefined();
    });
  });

  describe('Combined Validation and Documentation', () => {
    it('DTO should work for both validation and documentation', async () => {
      // Test that the same DTO works for validation
      const schema = CreateUserValibotDto.schema;
      const validData = { name: 'John', email: 'john@example.com', age: 25 };

      const result = await schema['~standard'].validate(validData);
      expect(result.value).toEqual(validData);

      // Test that it also provides OpenAPI metadata
      const metadata = CreateUserValibotDto._OPENAPI_METADATA_FACTORY();
      expect(metadata).toBeDefined();
      expect(Object.keys(metadata).length).toBeGreaterThan(0);
    });

    it('DTO should reject invalid data while providing documentation', async () => {
      const schema = CreateUserValibotDto.schema;
      const invalidData = { name: '', email: 'not-an-email' };

      const result = await schema['~standard'].validate(invalidData);
      expect(result.issues).toBeDefined();
      expect(result.issues!.length).toBeGreaterThan(0);

      // OpenAPI metadata should still be available
      const metadata = CreateUserValibotDto._OPENAPI_METADATA_FACTORY();
      expect(metadata).toBeDefined();
    });
  });
});
