import {
    Get, Route,
} from '../../../src';
import { TestModel } from '../../fixtures/testModel';
import { ModelService } from '../services/modelService';

@Route()
export class RootController {

    @Get()
    public async rootHandler(): Promise<TestModel> {
        return Promise.resolve(new ModelService().getModel());
    }

    @Get('rootControllerMethodWithPath')
    public async rootControllerMethodWithPath(): Promise<TestModel> {
        return Promise.resolve(new ModelService().getModel());
    }

}
