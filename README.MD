# typeswag

## Table of Contents

  * [Overview](#overview)
  * [Philosophy](#philosophy)
  * [Goal](#goal)
  * [How it works](#how-it-works)
  * [Installation](#installation)
  * [Usage](#usage)
    - [Create Configuration](#create-configuration)
    - [Create Controllers](#create-controllers)
    - [Create Models](#create-models)
    - [Dealing with duplicate model names](#dealing-with-duplicate-model-names)
    - [Using awesome Swagger tools](#using-awesome-swagger-tools)
  * [Decorators](#decorators)
    - [Security](#security)
    - [Tags](#tags)
    - [OperationId](#operationid)

## Overview

This library will generate Swagger documentation with self-descriptive controllers, that make heavy use of decorators. Best used with another library, that use decorators to register controllers with web framework of choice (f.e. [routing-controllers](https://github.com/typestack/routing-controllers)).

This is a fork of [tsoa](https://github.com/lukeautry/tsoa). This library stripped it's route generation module, as this library should be focused only with generating Swagger documentation.

## Philosophy

Tsoa's Swagger documentation module works well, but it's limitation of injecting custom decorators proved to be the reason of forking. That is why this fork:

- Should register & not interfere with custom decorators, including
  * [x] route decorators
  * [ ] parameter decorators

This library inherits previous philosophies:

- Rely on TypeScript type annotations to generate API metadata if possible
- If regular type annotations aren't an appropriate way to express metadata, use decorators
- Use jsDoc for pure text metadata (e.g. endpoint descriptions)
- Minimize boilerplate
- Models are best represented by interfaces (pure data structures), but can also be represented by classes

## Goal

- TypeScript controllers and models as the single source of truth for your API
- A valid swagger spec is generated from your controllers and models, including:
    - Paths (e.g. GET /Users)
    - Definitions based on TypeScript interfaces (models)
    - Parameters/model properties marked as required or optional based on TypeScript (e.g. myProperty?: string is optional in the Swagger spec)
    - jsDoc supported for object descriptions (most other metadata can be inferred from TypeScript types)

## How it works

When you specify an entry TypeScript file, the metadata generation module will create a TypeScript in-memory program & parse through the AST nodes.

From there, it tries to find classes (controllers) from that entry file, that are annotated with registered route decorators. After that, controller's registered methods & parameters are sequentially added to the metadata.

Since parameters are typed, it tries to bind that type to an interface or class & add those attributes to the metadata.

This repeats, until every import has been traversed.

## Installation

```sh
npm install -D typeswag
```

## Usage

Note, that the examples provided are done with [routing-controllers](https://github.com/typestack/routing-controllers) library, but can be adjusted with custom library.

### Create Configuration

```javascript
// commands/swagger.js

const package = require('../package.json');
const routingControllers = require('routing-controllers');
const tsoa = require('tsoa');

// This registers custom route decorators, that will be known during generating.
tsoa.registerRouteDecorator(routingControllers.Controller);
tsoa.registerRouteDecorator(routingControllers.JsonController);

tsoa.generateSwaggerSpec({
    version: package.version,
    outputDirectory: './src/api/',
    entryFile: './src/api/controllers/index.ts',
    basePath: '/api',
});
```

### Create Controllers

```typescript
// controllers/usersController.ts

import { JsonController, Get, Post, Body } from 'routing-controllers';
import { SuccessResponse } from 'typeswag';
import { UserService } from '../services/UserService';
import { User, UserCreationRequest } from '../models/User';

@JsonController('/user')
export class UserController extends Controller {

    @Get('/{id}')
    public async getUser(id: number, @Query() name: string): Promise<User> {
        return await new UserService().get(id);
    }

    // In order to provide more hints to the Swagger generator, we can mix typeswag's
    // decorators with custom decorators.
    @SuccessResponse('201', 'Created')
    @Post()
    public async createUser(@Body() requestBody: UserCreationRequest): Promise<void> {
        new UserService().create(request);
        return Promise.resolve();
    }
}
```

### Create Models
```typescript
// models/user.ts

export interface User {
    id: number;
    email: string;
    name: Name;
    status?: status;
    phoneNumbers: string[];
}

export type status = 'Happy' | 'Sad';

export interface Name {
    first: string;
    last?: string;
}

export interface UserCreationRequest {
    email: string;
    name: Name;
    phoneNumbers: string[];
}
```

Note that type aliases are only supported for string literal types like `type status = 'Happy' | 'Sad'`

### Dealing with duplicate model names
If you have multiple models with the same name, you may get errors indicating that there are multiple matching models. If you'd like to designate a class/interface as the 'canonical' version of a model, add a jsDoc element marking it as such:

```typescript
/**
 * @typeswagModel
 */
export interface MyModel {
    ...
}
```

### Tags

If you have a project that needs a description and/or external docs for tags, you can configure the internal generators to use the correct tags definitions and external docs by providing a tags property to swagger property in configuration.

```javascript
// commands/swagger.js

tsoa.generateSwaggerSpec({
    // ...
    tags: [
        {
            name: "User",
            description: "Operation about users",
            externalDocs: {
                description: "Find out more about users",
                url: "http://swagger.io"
            }
        }
    ],
    // ...
});
```

### Using awesome Swagger tools

Now that you have a swagger spec (swagger.json), you can use all kinds of amazing tools that [generate documentation, client SDKs, and more](http://swagger.io/).

## Decorators

### Security

The `Security` decorator can be used above controller methods to indicate that there should be authentication before running those methods. As described above, the authentication is done in a file that's referenced in tsoa's configuration. When using the `Security` decorator, you can choose between having one or multiple authentication methods. If you choose to have multiple authentication methods, you can choose between having to pass one of the methods (OR):

```ts
@Security('tsoa_auth', ['write:pets', 'read:pets'])
@Security('api_key')
@Get('OauthOrAPIkey')
public async GetWithOrSecurity(@Request() request: express.Request): Promise<any> {
}
```

or having to pass all of them (AND):

```ts
@Security({
  tsoa_auth: ['write:pets', 'read:pets'],
  api_key: [],
})
@Get('OauthAndAPIkey')
public async GetWithAndSecurity(@Request() request: express.Request): Promise<any> {
}
```

### Tags

Tags are defined with the `@Tags('tag1', 'tag2', ...)` decorator in the controllers and/or in the methods like in the following examples.

```ts
import { Get, Route, Response, Tags } from 'tsoa';

@Route('user')
@Tags('User')
export class UserController {
    @Response<ErrorResponseModel>('Unexpected error')
    @Get('UserInfo')
    @Tags('Info', 'Get')
    public async userInfo(@Request() request: any): Promise<UserResponseModel> {
        return Promise.resolve(request.user);
    }

    @Get('EditUser')
    @Tags('Edit')
    public async userInfo(@Request() request: any): Promise<string> {
        // Do something here
    }
}
```

### OperationId

Set operationId parameter under operation's path.
Useful for use with Swagger code generation tool since this parameter is used to name the function generated in the client SDK.

```ts
@Get()
@OperationId('findDomain')
public async find(): Promise<any> {

}
```
