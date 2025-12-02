import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Controller, Post, Body, Get, Module, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { z } from 'zod';
import * as v from 'valibot';
import {
  StandardValidationPipe,
  createStandardDto,
  StandardSerializerInterceptor,
  ResponseSchema,
} from '../../src';

// ============================================
// Test Schemas and DTOs
// ============================================

// Zod Schema
const CreateUserZodSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

class CreateUserZodDto extends createStandardDto(CreateUserZodSchema) {}

// Valibot Schema
const CreateUserValibotSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  email: v.pipe(v.string(), v.email()),
  age: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

class CreateUserValibotDto extends createStandardDto(CreateUserValibotSchema) {}

// Response Schema
const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

class UserResponseDto extends createStandardDto(UserResponseSchema) {}

// ============================================
// Test Controllers
// ============================================

@Controller('zod')
class ZodTestController {
  @Post('users')
  createUser(@Body(new StandardValidationPipe(CreateUserZodSchema)) body: CreateUserZodDto) {
    return { id: '1', ...body };
  }

  @Post('users-dto')
  createUserWithDto(@Body() body: CreateUserZodDto) {
    return { id: '1', ...body };
  }
}

@Controller('valibot')
class ValibotTestController {
  @Post('users')
  createUser(
    @Body(new StandardValidationPipe(CreateUserValibotSchema)) body: CreateUserValibotDto,
  ) {
    return { id: '1', ...body };
  }
}

@Controller('serializer')
class SerializerTestController {
  @Get('user')
  @ResponseSchema(UserResponseDto)
  getUser() {
    // Return extra fields that should be stripped
    return {
      id: '1',
      name: 'John',
      email: 'john@example.com',
      password: 'secret123', // Should be stripped
      internalField: 'internal', // Should be stripped
    };
  }

  @Get('users')
  @ResponseSchema([UserResponseDto])
  getUsers() {
    // Return array with extra fields that should be stripped
    return [
      { id: '1', name: 'John', email: 'john@example.com', password: 'secret1' },
      { id: '2', name: 'Jane', email: 'jane@example.com', password: 'secret2' },
    ];
  }
}

// ============================================
// Test Module
// ============================================

@Module({
  controllers: [ZodTestController, ValibotTestController, SerializerTestController],
})
class TestModule {}

// ============================================
// E2E Tests
// ============================================

describe('NestJS E2E Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();

    // Global pipe for DTO-based validation
    app.useGlobalPipes(new StandardValidationPipe());

    // Global interceptor for response serialization
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(new StandardSerializerInterceptor(reflector));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Zod Integration', () => {
    describe('POST /zod/users (route-level pipe)', () => {
      it('should accept valid data', async () => {
        const response = await request(app.getHttpServer())
          .post('/zod/users')
          .send({ name: 'John', email: 'john@example.com', age: 25 })
          .expect(201);

        expect(response.body).toEqual({
          id: '1',
          name: 'John',
          email: 'john@example.com',
          age: 25,
        });
      });

      it('should accept valid data without optional field', async () => {
        const response = await request(app.getHttpServer())
          .post('/zod/users')
          .send({ name: 'John', email: 'john@example.com' })
          .expect(201);

        expect(response.body).toEqual({
          id: '1',
          name: 'John',
          email: 'john@example.com',
        });
      });

      it('should reject invalid email with path in error', async () => {
        const response = await request(app.getHttpServer())
          .post('/zod/users')
          .send({ name: 'John', email: 'invalid-email' })
          .expect(400);

        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toBeDefined();
        expect(response.body.errors.length).toBeGreaterThan(0);
        // Verify error path points to 'email' field
        expect(response.body.errors[0].path).toContain('email');
      });

      it('should reject empty name', async () => {
        const response = await request(app.getHttpServer())
          .post('/zod/users')
          .send({ name: '', email: 'john@example.com' })
          .expect(400);

        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject negative age', async () => {
        const response = await request(app.getHttpServer())
          .post('/zod/users')
          .send({ name: 'John', email: 'john@example.com', age: -5 })
          .expect(400);

        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject missing required fields', async () => {
        const response = await request(app.getHttpServer())
          .post('/zod/users')
          .send({})
          .expect(400);

        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('POST /zod/users-dto (global pipe with DTO)', () => {
      it('should pass through without metatype validation when no schema provided', async () => {
        // Note: Global pipe without explicit schema relies on metatype
        // TypeScript type annotations are not preserved at runtime
        // So this will pass through without validation
        const response = await request(app.getHttpServer())
          .post('/zod/users-dto')
          .send({ name: 'Jane', email: 'jane@example.com' })
          .expect(201);

        expect(response.body).toEqual({
          id: '1',
          name: 'Jane',
          email: 'jane@example.com',
        });
      });
    });
  });

  describe('Valibot Integration', () => {
    describe('POST /valibot/users', () => {
      it('should accept valid data', async () => {
        const response = await request(app.getHttpServer())
          .post('/valibot/users')
          .send({ name: 'Alice', email: 'alice@example.com', age: 30 })
          .expect(201);

        expect(response.body).toEqual({
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
          age: 30,
        });
      });

      it('should reject invalid email', async () => {
        const response = await request(app.getHttpServer())
          .post('/valibot/users')
          .send({ name: 'Alice', email: 'not-an-email' })
          .expect(400);

        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject empty name', async () => {
        await request(app.getHttpServer())
          .post('/valibot/users')
          .send({ name: '', email: 'alice@example.com' })
          .expect(400);
      });
    });
  });

  describe('Response Serialization', () => {
    describe('GET /serializer/user', () => {
      it('should strip extra fields from response', async () => {
        const response = await request(app.getHttpServer())
          .get('/serializer/user')
          .expect(200);

        expect(response.body).toEqual({
          id: '1',
          name: 'John',
          email: 'john@example.com',
        });
        expect(response.body.password).toBeUndefined();
        expect(response.body.internalField).toBeUndefined();
      });
    });

    describe('GET /serializer/users (array response)', () => {
      it('should strip extra fields from array response', async () => {
        const response = await request(app.getHttpServer())
          .get('/serializer/users')
          .expect(200);

        expect(response.body).toEqual([
          { id: '1', name: 'John', email: 'john@example.com' },
          { id: '2', name: 'Jane', email: 'jane@example.com' },
        ]);
        expect(response.body[0].password).toBeUndefined();
        expect(response.body[1].password).toBeUndefined();
      });
    });
  });

  describe('Error Response Format', () => {
    it('should return structured error response', async () => {
      const response = await request(app.getHttpServer())
        .post('/zod/users')
        .send({ name: 'John', email: 'invalid', age: 'not-a-number' })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: expect.any(Array),
            message: expect.any(String),
          }),
        ]),
      });
    });
  });
});
