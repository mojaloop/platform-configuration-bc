"use strict"

import {ConfigParameterTypes} from "@mojaloop/platform-configuration-bc-types-lib";
import axios, {AxiosResponse} from "axios";
import {AppConfiguration, DefaultConfigProvider} from "../../src/index";
import {ConsoleLogger, ILogger} from "@mojaloop/logging-bc-logging-client-lib";

const ENV_NAME = "dev";
const BC_NAME = "platform-configuration";
const APP_NAME = "platform-configuration-client-lib";
const CONFIGSET_VERSION = "0.0.1";
const CONFIG_SVC_BASEURL = "http://localhost:3000";

let appConfiguration: AppConfiguration;
let defaultConfigProvider: DefaultConfigProvider;


const logger: ILogger = new ConsoleLogger();

describe('client-lib ConfigurationSet tests', () => {
    beforeAll(async () => {
        // Setup
    })

    afterAll(async () => {
        // Cleanup
    })

    test('Create AppConfiguration', async () => {
        // Setup
        defaultConfigProvider = new DefaultConfigProvider(CONFIG_SVC_BASEURL);
        appConfiguration = new AppConfiguration(ENV_NAME, BC_NAME, APP_NAME, CONFIGSET_VERSION, defaultConfigProvider);

        /// params
        appConfiguration.addNewParam("boolParam1", ConfigParameterTypes.BOOL, true, "description bool param 1 - v"+CONFIGSET_VERSION);
        appConfiguration.addNewParam("stringParam1", ConfigParameterTypes.STRING, "default val", "description string param 1 - v"+CONFIGSET_VERSION);
        appConfiguration.addNewParam("intParam1", ConfigParameterTypes.INT_NUMBER, 5, "description int number param 1 - v"+CONFIGSET_VERSION);
        appConfiguration.addNewParam("floatParam1", ConfigParameterTypes.INT_NUMBER, 3.1415, "description float number param 1 - v"+CONFIGSET_VERSION);

        /// feature flags
        appConfiguration.addNewFeatureFlag("featureFlag1", false, "description feature flag 1 - v"+CONFIGSET_VERSION);

        /// secrets
        appConfiguration.addNewSecret("secret1", "password", "description secret 1 - v"+CONFIGSET_VERSION);

        //console.log("Before bootstrap:");
        //console.log(appConfiguration.toJsonObj());
    });

    /*test('Expect to fail without init',  async ()=> {
        expect.assertions(1);
        //appConfiguration.init();
        await expect(appConfiguration.bootstrap()).toBe(Error);
        //await expect(appConfiguration.bootstrap()).rejects.toThrow(Error);

        // await expect(async () => {
        //     appConfiguration.init();
        //     await appConfiguration.bootstrap();
        // }).rejects.toThrowError();

        // expect.assertions(1);
        // //appConfiguration.init();
        // // await appConfiguration.bootstrap()
        //
        // try {
        //     await appConfiguration.bootstrap()
        //     //return new Error("should not allow bootstrap without calling init first")
        // }catch(e){
        //     expect(e).toMatch('error');
        // }
    })*/

    test('Full flow', async () => {
        await appConfiguration.init();

        await appConfiguration.bootstrap();

        // fetch
        await appConfiguration.fetch();

        expect(appConfiguration.applicationVersion).toBeDefined();
        expect(appConfiguration.applicationVersion).toEqual(CONFIGSET_VERSION);

    })


    /*  test('fetch', async () => {
        await appConfiguration.fetch();

     })*/
})
