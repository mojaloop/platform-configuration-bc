"use strict"

import {ConfigParameterTypes} from "@mojaloop/platform-configuration-bc-types-lib";
import axios, {AxiosResponse} from "axios";
import {ConfigurationSet, DefaultConfigProvider} from "../../";
import {ConsoleLogger, ILogger} from "@mojaloop/logging-bc-logging-client-lib";

const BC_NAME = "platform-configuration";
const APP_NAME = "platform-configuration-client-lib";
const CONFIGSET_VERSION = 1;
const CONFIG_SVC_BASEURL = "http://localhost:3000";

let configSet: ConfigurationSet;
let defaultConfigProvider: DefaultConfigProvider;


const logger: ILogger = new ConsoleLogger();

describe('client-lib ConfigurationSet tests', () => {
    beforeAll(async () => {
        // Setup
    })

    afterAll(async () => {
        // Cleanup
    })

    test('Create ConfigurationSet', async () => {
        // Setup
        defaultConfigProvider = new DefaultConfigProvider(CONFIG_SVC_BASEURL);
        configSet = new ConfigurationSet(BC_NAME, APP_NAME, CONFIGSET_VERSION, defaultConfigProvider);

        /// params
        configSet.addNewParam("boolParam1", ConfigParameterTypes.BOOL, true, "description bool param 1 - v"+CONFIGSET_VERSION);
        configSet.addNewParam("stringParam1", ConfigParameterTypes.STRING, "default val", "description string param 1 - v"+CONFIGSET_VERSION);
        configSet.addNewParam("intParam1", ConfigParameterTypes.INT_NUMBER, 5, "description int number param 1 - v"+CONFIGSET_VERSION);
        configSet.addNewParam("floatParam1", ConfigParameterTypes.INT_NUMBER, 3.1415, "description float number param 1 - v"+CONFIGSET_VERSION);

        /// feature flags
        configSet.addNewFeatureFlag("featureFlag1", false, "description feature flag 1 - v"+CONFIGSET_VERSION);

        /// secrets
        configSet.addNewSecret("secret1", "password", "description secret 1 - v"+CONFIGSET_VERSION);

        //console.log("Before bootstrap:");
        //console.log(configSet.toJsonObj());
    });

    /*test('Expect to fail without init',  async ()=> {
        expect.assertions(1);
        //configSet.init();
        await expect(configSet.bootstrap()).toBe(Error);
        //await expect(configSet.bootstrap()).rejects.toThrow(Error);

        // await expect(async () => {
        //     configSet.init();
        //     await configSet.bootstrap();
        // }).rejects.toThrowError();

        // expect.assertions(1);
        // //configSet.init();
        // // await configSet.bootstrap()
        //
        // try {
        //     await configSet.bootstrap()
        //     //return new Error("should not allow bootstrap without calling init first")
        // }catch(e){
        //     expect(e).toMatch('error');
        // }
    })*/

    test('Full flow', async () => {
        await configSet.init();

        await configSet.bootstrap();

        // fetch
        await configSet.fetch();

        expect(configSet.versionNumber).toBeDefined();
        expect(configSet.versionNumber).toEqual(CONFIGSET_VERSION);

    })


    /*  test('fetch', async () => {
        await configSet.fetch();

     })*/
})
