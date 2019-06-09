# typeswag

[![Build Status](https://travis-ci.com/adrianplavka/typeswag.svg?branch=master)](https://travis-ci.com/adrianplavka/typeswag)
[![npm version](https://badge.fury.io/js/typeswag.svg)](https://badge.fury.io/js/typeswag)

Generate Swagger documentation from self-descriptive controllers, that make heavy use of decorators. Best used with another library, that use decorators to register controllers (f.e. [routing-controllers](https://github.com/typestack/routing-controllers)) with web framework of choice.

This is a clone of [tsoa](https://github.com/lukeautry/tsoa). This library stripped it's route generation module, as it should be focused only with generating Swagger documentation.

## Table of Contents

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

## Philosophy

Tsoa's Swagger documentation module works well, but it's limitation of injecting custom decorators proved to be the reason of cloning. That is why this clone:

- Should register & not interfere with custom decorators, including
  * [x] route decorators
  * [ ] method decorators
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

It tries to find classes (controllers) from that entry file, that are annotated with registered route decorators. After that, controller's registered methods & parameters are sequentially added to the metadata.

Since parameters are typed, it tries to bind that type to an interface or class & add those attributes to the metadata.

This repeats, until every import has been traversed.

## Installation

```sh
npm install -D typeswag
```

## Usage

Note, that the examples provided are done with [routing-controllers](https://github.com/typestack/routing-controllers) library, but can be adjusted with custom library.

### Create Configuration

```ts
// commands/swagger.ts

import * as pkg from '../package.json';
import * as routingControllers from 'routing-controllers';
import { SwaggerGenerator } from 'typeswag';

const swagger = new SwaggerGenerator();

// This registers custom route decorators, that will be known during generating.
swagger.registerRouteDecorator(routingControllers.Controller);
swagger.registerRouteDecorator(routingControllers.JsonController, path => `/json/${path}`);

swagger.generate({
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    entryFile: './src/index.ts',
    basePath: '/api',
    output: {
        path: './src/',
    }
});
```

### Create Entry File

```ts
// src/api/controllers/index.ts

// These imports will be crawled by the metadata generator.
import "./UserController";
import "./PetController";
// ...
```

### Create Controllers

```ts
// src/api/controllers/UserController.ts

import { JsonController, Get, Post, Body } from 'routing-controllers';
import { SuccessResponse } from 'typeswag';
import { UserService } from '../services/UserService';
import { User, UserCreationRequest } from '../models/User';

/**
 * This decorator has been registered earlier, therefore the crawler will pick it up!
 *
 * Also note, that the path parameter in brackets will be applied to every route.
 */
@JsonController('/user/{domain}')
export class UserController {

    /**
     * This JSDoc comment will be added to the documentation as a description.
     *
     * GetUser is a controller function, that will accept an id path with a name in query
     * & return the user.
     * 
     * @param id Identification of user in path
     * @param name Name of the user in query
     * @returns User
     *
     */
    @Get('/{id}')
    public async getUser(id: number, @Query() name: string): Promise<User> {
        return await new UserService().get(id);
    }

    /**
     * To provide more hints to the Swagger generator, we can mix typeswag's
     * decorators with custom decorators.
     */
    @SuccessResponse('201', 'Created')
    @Post()
    public async createUser(@Body() user: UserCreationRequest): Promise<void> {
        new UserService().create(user);
    }
}
```

### Create Models
```ts
// models/user.ts

/** 
 * Classes are also supported by the generator!
 *
 * Only public attributes will get added to the documentation.
 */
export class User {
    public id: number;
    public username: string;
    public password: string;
}

/**
 * Union types are supported only for primitive values (like strings, numbers, booleans, ...).
 * They will be represented as enum in the documentation.
 *
 * Note, that the types in union must be of the same type!
 */
export type status = 'Happy' | 'Sad';

/**
 * Interfaces work just like classes!
 *
 * Optional attributes will get marked as not required in the documentation.
 */
export interface Name {
    first: string;
    last?: string;
}

/**
 * Extending interfaces works as well!
 */
export interface UserCreationRequest extends UserRequest {
    email: string;
    name: Name;
    phoneNumbers: string[];
}

export interface UserRequest {
    type: 'create' | 'modify' | 'delete';
}

```

Note that type aliases are only supported for string literal types like `type status = 'Happy' | 'Sad'`

### Dealing with duplicate model names
If you have multiple models with the same name, you may get errors indicating that there are multiple matching models. If you'd like to designate a class/interface as the 'canonical' version of a model, add a jsDoc element marking it as such:

```ts
/**
 * @typeswagModel
 */
export interface MyModel {
    // ...
}
```

### Tags

If you have a project that needs a description and/or external docs for tags, you can configure the internal generators to use the correct tags definitions and external docs by providing a tags property to swagger property in configuration.

```ts
// commands/swagger.ts

const swagger = new SwaggerGenerator();
swagger.generate({
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
