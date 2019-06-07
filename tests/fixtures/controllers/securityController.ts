import {
    Get, Response, Route, Security,
} from '../../../src';
import { ErrorResponseModel, UserResponseModel } from '../../fixtures/testModel';

@Route('SecurityTest')
export class SecurityController {

    @Response<ErrorResponseModel>('default', 'Unexpected error')
    @Security('api_key')
    @Get()
    public async GetWithApi(): Promise<UserResponseModel> {
        return Promise.resolve({ id: 1, name: 'User' });
    }

    @Response<ErrorResponseModel>('404', 'Not Found')
    @Security('auth', ['write:pets', 'read:pets'])
    @Get('Oauth')
    public async GetWithSecurity(): Promise<UserResponseModel> {
        return Promise.resolve({ id: 1, name: 'User' });
    }

    @Response<ErrorResponseModel>('404', 'Not Found')
    @Security('auth', ['write:pets', 'read:pets'])
    @Security('api_key')
    @Get('OauthOrAPIkey')
    public async GetWithOrSecurity(): Promise<UserResponseModel> {
        return Promise.resolve({ id: 1, name: 'User' });
    }

    @Response<ErrorResponseModel>('404', 'Not Found')
    @Security({
        api_key: [],
        auth: ['write:pets', 'read:pets'],
    })
    @Get('OauthAndAPIkey')
    public async GetWithAndSecurity(): Promise<UserResponseModel> {
        return Promise.resolve({ id: 1, name: 'User' });
    }

    @Response<ErrorResponseModel>('default', 'Unexpected error')
    @Security('api_key')
    @Get('ServerError')
    public async GetServerError(): Promise<UserResponseModel> {
        return Promise.reject(new Error('Unexpected'));
    }
}
