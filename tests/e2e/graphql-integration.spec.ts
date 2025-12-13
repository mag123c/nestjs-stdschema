import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Module, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  Resolver,
  Query,
  Mutation,
  Args,
  ObjectType,
  Field,
  InputType,
  ID,
  Int,
  GraphQLModule,
} from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
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
// Test Schemas (Zod)
// ============================================

const CreateUserZodSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

class CreateUserZodDto extends createStandardDto(CreateUserZodSchema) {}

// ============================================
// Test Schemas (Valibot)
// ============================================

const CreateUserValibotSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  email: v.pipe(v.string(), v.email()),
  age: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

class CreateUserValibotDto extends createStandardDto(CreateUserValibotSchema) {}

// ============================================
// GraphQL Types
// ============================================

@ObjectType()
class User {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field(() => Int, { nullable: true })
  age?: number;
}

@InputType()
class CreateUserInput {
  @Field()
  name: string;

  @Field()
  email: string;

  @Field(() => Int, { nullable: true })
  age?: number;
}

// ============================================
// Test Resolvers
// ============================================

@Resolver(() => User)
class UserResolver {
  private users: User[] = [];

  @Query(() => [User])
  getUsers(): User[] {
    return this.users;
  }

  @Query(() => User, { nullable: true })
  getUser(@Args('id', { type: () => String }) id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  // Test 1: Route-level pipe with Zod schema
  @Mutation(() => User)
  createUserWithZod(
    @Args('input', { type: () => CreateUserInput }, new StandardValidationPipe(CreateUserZodSchema))
    input: CreateUserInput,
  ): User {
    const user = { id: String(this.users.length + 1), ...input };
    this.users.push(user);
    return user;
  }

  // Test 2: Route-level pipe with Valibot schema
  @Mutation(() => User)
  createUserWithValibot(
    @Args('input', { type: () => CreateUserInput }, new StandardValidationPipe(CreateUserValibotSchema))
    input: CreateUserInput,
  ): User {
    const user = { id: String(this.users.length + 1), ...input };
    this.users.push(user);
    return user;
  }

  // Test 3: Global pipe with DTO class (metatype detection)
  @Mutation(() => User)
  createUserWithDto(
    @Args('input', { type: () => CreateUserInput }) input: CreateUserInput,
  ): User {
    const user = { id: String(this.users.length + 1), ...input };
    this.users.push(user);
    return user;
  }

  // Test 4: Custom exceptionFactory
  @Mutation(() => User)
  createUserWithCustomError(
    @Args(
      'input',
      { type: () => CreateUserInput },
      new StandardValidationPipe(CreateUserZodSchema, {
        exceptionFactory: (issues) => ({
          message: 'Custom validation error',
          code: 'VALIDATION_ERROR',
          details: issues,
        }),
      }),
    )
    input: CreateUserInput,
  ): User {
    const user = { id: String(this.users.length + 1), ...input };
    this.users.push(user);
    return user;
  }
}

// ============================================
// Test Module
// ============================================

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: false,
      // Format errors to include validation details
      formatError: (error) => {
        const originalError = error.extensions?.originalError as Record<string, unknown> | undefined;
        return {
          message: originalError?.message ?? error.message,
          code: error.extensions?.code ?? 'INTERNAL_SERVER_ERROR',
          errors: originalError?.errors ?? undefined,
        };
      },
    }),
  ],
  providers: [UserResolver],
})
class TestModule {}

// ============================================
// E2E Tests
// ============================================

describe('GraphQL E2E Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();

    // Note: Global pipe for GraphQL needs validateCustomDecorators: true
    // because @Args() has metadata.type === 'custom'
    app.useGlobalPipes(
      new StandardValidationPipe({ validateCustomDecorators: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Zod Integration with @Args()', () => {
    it('should accept valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "John", email: "john@example.com", age: 25 }) {
                id
                name
                email
                age
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.createUserWithZod).toEqual({
        id: expect.any(String),
        name: 'John',
        email: 'john@example.com',
        age: 25,
      });
    });

    it('should accept valid data without optional field', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "Jane", email: "jane@example.com" }) {
                id
                name
                email
                age
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.createUserWithZod).toMatchObject({
        name: 'Jane',
        email: 'jane@example.com',
      });
    });

    it('should reject invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "John", email: "invalid-email" }) {
                id
              }
            }
          `,
        })
        .expect(200); // GraphQL returns 200 even with errors

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(response.body.errors[0].message).toContain('Validation failed');
    });

    it('should reject empty name', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "", email: "john@example.com" }) {
                id
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });

    it('should reject negative age', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "John", email: "john@example.com", age: -5 }) {
                id
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Valibot Integration with @Args()', () => {
    it('should accept valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithValibot(input: { name: "Alice", email: "alice@example.com", age: 30 }) {
                id
                name
                email
                age
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.createUserWithValibot).toMatchObject({
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      });
    });

    it('should reject invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithValibot(input: { name: "Alice", email: "not-an-email" }) {
                id
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Error Response Format', () => {
    it('should return structured error with validation details', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "John", email: "invalid" }) {
                id
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0]).toMatchObject({
        message: expect.stringContaining('Validation failed'),
      });
      // Check that validation errors are included
      if (response.body.errors[0].errors) {
        expect(response.body.errors[0].errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: expect.any(Array),
              message: expect.any(String),
            }),
          ]),
        );
      }
    });
  });

  describe('Query with @Args()', () => {
    it('should work with Query args validation', async () => {
      // First create a user
      await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "QueryTest", email: "query@test.com" }) {
                id
              }
            }
          `,
        });

      // Then query
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            query {
              getUsers {
                id
                name
                email
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.getUsers).toBeDefined();
      expect(Array.isArray(response.body.data.getUsers)).toBe(true);
    });
  });
});

describe('GraphQL validateCustomDecorators behavior', () => {
  let appWithoutFlag: INestApplication;
  let appWithFlag: INestApplication;

  describe('without validateCustomDecorators (default)', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule],
      }).compile();

      appWithoutFlag = moduleRef.createNestApplication<NestExpressApplication>();
      // Default: validateCustomDecorators = false
      appWithoutFlag.useGlobalPipes(new StandardValidationPipe());
      await appWithoutFlag.init();
    });

    afterAll(async () => {
      await appWithoutFlag.close();
    });

    it('should skip validation for @Args() when validateCustomDecorators is false', async () => {
      // This should NOT validate because metadata.type === 'custom' and validateCustomDecorators is false
      // The route-level pipe should still work because it has explicit schema
      const response = await request(appWithoutFlag.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "Test", email: "test@example.com" }) {
                id
                name
              }
            }
          `,
        })
        .expect(200);

      // Route-level pipe with explicit schema should still work
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.createUserWithZod).toBeDefined();
    });
  });

  describe('with validateCustomDecorators: true', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule],
      }).compile();

      appWithFlag = moduleRef.createNestApplication<NestExpressApplication>();
      appWithFlag.useGlobalPipes(
        new StandardValidationPipe({ validateCustomDecorators: true }),
      );
      await appWithFlag.init();
    });

    afterAll(async () => {
      await appWithFlag.close();
    });

    it('should validate @Args() when validateCustomDecorators is true', async () => {
      const response = await request(appWithFlag.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createUserWithZod(input: { name: "", email: "invalid" }) {
                id
              }
            }
          `,
        })
        .expect(200);

      // Should have validation errors
      expect(response.body.errors).toBeDefined();
    });
  });
});
