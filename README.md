# @mag123c/nestjs-stdschema

Universal schema validation for NestJS using the [standard-schema](https://github.com/standard-schema/standard-schema) specification.

[![npm version](https://img.shields.io/npm/v/@mag123c/nestjs-stdschema.svg)](https://www.npmjs.com/package/@mag123c/nestjs-stdschema)
[![CI](https://github.com/mag123c/nestjs-stdschema/actions/workflows/ci.yml/badge.svg)](https://github.com/mag123c/nestjs-stdschema/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mag123c/nestjs-stdschema/graph/badge.svg)](https://codecov.io/gh/mag123c/nestjs-stdschema)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![](https://img.shields.io/npm/d18m/@mag123c/nestjs-stdschema)
![](https://img.shields.io/github/last-commit/mag123c/nestjs-stdschema)


## Why This Package?

- **One package, any standard-schema validator**: Tested with Zod & Valibot, compatible with 20+ validators implementing the spec
- **Zero vendor lock-in**: Switch validators without changing your NestJS code
- **Type-safe**: Full TypeScript support with automatic type inference
- **OpenAPI ready**: Automatic Swagger documentation via `@nestjs/swagger` integration
- **Minimal footprint**: No runtime dependencies on specific validators

## Installation

```bash
npm install @mag123c/nestjs-stdschema
# or
pnpm add @mag123c/nestjs-stdschema
# or
yarn add @mag123c/nestjs-stdschema
```

Then install your preferred validator:

```bash
# Zod
npm install zod

# Valibot
npm install valibot

# ArkType
npm install arktype
```

## Quick Start

### Basic Validation (Route Level)

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { StandardValidationPipe } from '@mag123c/nestjs-stdschema';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().optional(),
});

@Controller('users')
export class UsersController {
  @Post()
  create(
    @Body(new StandardValidationPipe(CreateUserSchema))
    body: z.infer<typeof CreateUserSchema>,
  ) {
    return body;
  }
}
```

### With DTO Class

```typescript
import { createStandardDto, StandardValidationPipe } from '@mag123c/nestjs-stdschema';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Create a DTO class with automatic type inference
class CreateUserDto extends createStandardDto(CreateUserSchema) {}

@Controller('users')
export class UsersController {
  @Post()
  create(
    @Body(new StandardValidationPipe(CreateUserDto.schema))
    body: CreateUserDto,
  ) {
    // body is fully typed as { name: string; email: string }
    return body;
  }
}
```

### Global Pipe

```typescript
import { StandardValidationPipe } from '@mag123c/nestjs-stdschema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global pipe requires @Schema decorator or createStandardDto
  app.useGlobalPipes(new StandardValidationPipe());

  await app.listen(3000);
}
```

> **Important**: Global pipe relies on TypeScript's `design:paramtypes` metadata to detect DTO classes. See [Requirements for Global Pipe](#requirements-for-global-pipe) section.

### With Valibot

```typescript
import { StandardValidationPipe } from '@mag123c/nestjs-stdschema';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  email: v.pipe(v.string(), v.email()),
});

@Post()
create(
  @Body(new StandardValidationPipe(CreateUserSchema))
  body: v.InferOutput<typeof CreateUserSchema>,
) {
  return body;
}
```

## Response Serialization

Strip sensitive fields from responses using `StandardSerializerInterceptor`:

```typescript
import {
  StandardSerializerInterceptor,
  ResponseSchema,
  createStandardDto,
} from '@mag123c/nestjs-stdschema';
import { z } from 'zod';

const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  // email and password are excluded from schema
});

class UserResponseDto extends createStandardDto(UserResponseSchema) {}

@Controller('users')
@UseInterceptors(StandardSerializerInterceptor)
export class UsersController {
  @Get(':id')
  @ResponseSchema(UserResponseDto)
  findOne(@Param('id') id: string) {
    // Even if this returns { id, name, email, password },
    // only { id, name } will be sent to the client
    return this.userService.findOne(id);
  }

  @Get()
  @ResponseSchema([UserResponseDto]) // Array response
  findAll() {
    return this.userService.findAll();
  }
}
```

### Global Interceptor

```typescript
import { Reflector } from '@nestjs/core';
import { StandardSerializerInterceptor } from '@mag123c/nestjs-stdschema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalInterceptors(
    new StandardSerializerInterceptor(app.get(Reflector))
  );

  await app.listen(3000);
}
```

> **Note**: The serializer strips extra fields by leveraging the validator's default behavior. Both Zod and Valibot strip unknown keys by default. If your validator preserves extra keys, use its strict/strip mode explicitly.

## GraphQL Support

`StandardValidationPipe` works with `@nestjs/graphql` out of the box:

### Route-Level Validation

```typescript
import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { StandardValidationPipe } from '@mag123c/nestjs-stdschema';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

@Resolver(() => User)
export class UserResolver {
  @Mutation(() => User)
  createUser(
    @Args('input', { type: () => CreateUserInput }, new StandardValidationPipe(CreateUserSchema))
    input: CreateUserInput,
  ) {
    return this.userService.create(input);
  }
}
```

### Global Pipe with GraphQL

When using global pipe with GraphQL, set `validateCustomDecorators: true` because `@Args()` uses `metadata.type === 'custom'`:

```typescript
import { StandardValidationPipe } from '@mag123c/nestjs-stdschema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new StandardValidationPipe({ validateCustomDecorators: true })
  );

  await app.listen(3000);
}
```

### GraphQL Error Handling

GraphQL converts `HttpException` to GraphQL errors. For better error formatting, use Apollo's `formatError`:

```typescript
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      formatError: (error) => {
        const originalError = error.extensions?.originalError as any;
        return {
          message: originalError?.message ?? error.message,
          code: error.extensions?.code ?? 'INTERNAL_SERVER_ERROR',
          errors: originalError?.errors ?? undefined,
        };
      },
    }),
  ],
})
export class AppModule {}
```

This produces cleaner error responses:

```json
{
  "errors": [{
    "message": "Validation failed",
    "code": "BAD_REQUEST",
    "errors": [
      { "path": ["email"], "message": "Invalid email" }
    ]
  }]
}
```

## API Reference

### StandardValidationPipe

```typescript
new StandardValidationPipe(schema?, options?)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `errorHttpStatusCode` | `HttpStatus` | `400` | HTTP status code for validation errors |
| `exceptionFactory` | `(issues) => any` | - | Custom exception factory |
| `validateCustomDecorators` | `boolean` | `false` | Validate custom decorator parameters |
| `expectedType` | `Type<any>` | - | Override metatype for validation |

### createStandardDto

```typescript
function createStandardDto<T extends StandardSchemaV1>(
  schema: T,
  options?: { openapi?: OpenAPIMetadata }
): StandardDtoClass<T>;
```

Creates a DTO class from a schema with:
- Static `schema` property
- Automatic type inference
- OpenAPI metadata generation

### Decorators

| Decorator | Description |
|-----------|-------------|
| `@Schema(schema)` | Attach schema to existing class |
| `@ResponseSchema(dto)` | Define response schema for serialization |
| `@ResponseSchema([dto])` | Define array response schema |

### Utilities

| Function | Description |
|----------|-------------|
| `getSchema(target)` | Get schema from DTO class |
| `schemaToOpenAPI(schema, metadata?)` | Convert schema to OpenAPI format |

### Type Utilities

```typescript
import { InferInput, InferOutput } from '@mag123c/nestjs-stdschema';

type Input = InferInput<typeof MySchema>;   // Input type
type Output = InferOutput<typeof MySchema>; // Output type
```

## Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "path": ["email"],
      "message": "Invalid email"
    },
    {
      "path": ["age"],
      "message": "Expected number, received string"
    }
  ]
}
```

### Custom Error Format

```typescript
new StandardValidationPipe(schema, {
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  exceptionFactory: (issues) => {
    return new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      errors: issues.map(issue => ({
        field: issue.path?.join('.') ?? 'root',
        message: issue.message,
      })),
    });
  },
});
```

## OpenAPI Integration

DTOs created with `createStandardDto` automatically work with `@nestjs/swagger`:

```typescript
import { createStandardDto } from '@mag123c/nestjs-stdschema';
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

class UserDto extends createStandardDto(UserSchema) {}
```

**OpenAPI schema generation:**

- **Zod v4+**: Automatically generates OpenAPI schema via native `toJSONSchema()`
- **Zod v3.x / Other validators**: Provide manual metadata

```typescript
// For validators without native toJSONSchema (Zod v3.x, Valibot, etc.)
class UserDto extends createStandardDto(UserSchema, {
  openapi: {
    name: { type: 'string', example: 'John' },
    email: { type: 'string', format: 'email' },
  },
}) {}
```

## Supported Validators

Any validator implementing the [standard-schema](https://github.com/standard-schema/standard-schema) specification:

| Validator | Version | Status |
|-----------|---------|--------|
| [Zod](https://github.com/colinhacks/zod) | ^3.24 / ^4.0 | Tested |
| [Valibot](https://github.com/fabian-hiller/valibot) | ^1.0.0 | Tested |
| [ArkType](https://github.com/arktypeio/arktype) | ^2.0.0 | Compatible* |
| [TypeBox](https://github.com/sinclairzx81/typebox) | ^0.32.0 | Compatible* |
| And more... | | [See full list](https://github.com/standard-schema/standard-schema#what-schema-libraries-implement-the-spec) |

> *Compatible: Implements standard-schema spec but not tested in this package. PRs welcome!

## Requirements

- Node.js >= 18
- NestJS >= 10.0.0
- TypeScript >= 5.0

### Requirements for Global Pipe

When using `StandardValidationPipe` as a global pipe (without explicitly passing a schema), it relies on TypeScript's `design:paramtypes` metadata to detect the DTO class and its schema. This is the same mechanism used by NestJS's built-in `ValidationPipe`.

**Required `tsconfig.json` settings:**

```json
{
  "compilerOptions": {
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

**Build tool compatibility:**

| Build Tool | Support | Configuration |
|------------|---------|---------------|
| `tsc` | Supported | Default with above tsconfig |
| `SWC` | Supported | Requires `decoratorMetadata: true` in `.swcrc` |
| `esbuild` | Not supported | Does not emit decorator metadata |
| `Vite` / `Vitest` | Not supported | Uses esbuild internally |

**SWC configuration (`.swcrc`):**

```json
{
  "jsc": {
    "transform": {
      "legacyDecorator": true,
      "decoratorMetadata": true
    }
  }
}
```

**If your build tool doesn't support decorator metadata**, use explicit schema passing instead:

```typescript
// Instead of relying on global pipe detection:
@Body() dto: CreateUserDto

// Explicitly pass the schema:
@Body(new StandardValidationPipe(CreateUserSchema)) dto: CreateUserDto
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Interested in adding support for a new validator? Check out [ADDING_VALIDATORS.md](./ADDING_VALIDATORS.md).

## License

[MIT](LICENSE)
