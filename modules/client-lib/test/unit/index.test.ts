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
        expect(defaultConfigProvider).toBeDefined()
        expect(defaultConfigProvider).not.toBeNull()

        appConfiguration = new AppConfiguration(ENV_NAME, BC_NAME, APP_NAME, CONFIGSET_VERSION, defaultConfigProvider);
        expect(appConfiguration).not.toBeNull()
        expect(appConfiguration.getAllParams().length).toEqual(0);
        expect(appConfiguration.getAllFeatureFlags().length).toEqual(0);
        expect(appConfiguration.getAllSecrets().length).toEqual(0);

        /// params
        appConfiguration.addNewParam("boolParam1", ConfigParameterTypes.BOOL, true, "description bool param 1 - v"+CONFIGSET_VERSION);
        expect(appConfiguration.getAllParams().length).toEqual(1);
        appConfiguration.addNewParam("stringParam1", ConfigParameterTypes.STRING, "default val", "description string param 1 - v"+CONFIGSET_VERSION);
        expect(appConfiguration.getAllParams().length).toEqual(2);
        appConfiguration.addNewParam("intParam1", ConfigParameterTypes.INT_NUMBER, 5, "description int number param 1 - v"+CONFIGSET_VERSION);
        expect(appConfiguration.getAllParams().length).toEqual(3);
        appConfiguration.addNewParam("floatParam1", ConfigParameterTypes.FLOAT_NUMBER, 3.1415, "description float number param 1 - v"+CONFIGSET_VERSION);
        expect(appConfiguration.getAllParams().length).toEqual(4);

        /// feature flags
        appConfiguration.addNewFeatureFlag("featureFlag1", false, "description feature flag 1 - v"+CONFIGSET_VERSION);
        expect(appConfiguration.getAllFeatureFlags().length).toEqual(1);

        /// secrets
        appConfiguration.addNewSecret("secret1", "password", "description secret 1 - v"+CONFIGSET_VERSION);
        expect(appConfiguration.getAllSecrets().length).toEqual(1);

        //console.log(appConfiguration.toJsonObj());

        expect(appConfiguration.applicationVersion).toBe(CONFIGSET_VERSION);
        expect(appConfiguration.iterationNumber).toBe(0);
    });


    test('Test params - defaults and current values', async () => {
        const boolParam1 = appConfiguration.getParam("boolParam1");
        expect(boolParam1).not.toBeNull()
        if(boolParam1) { // to avoid typecript can be null check
            expect(boolParam1.name).toBe("boolParam1")
            expect(boolParam1.type).toBe(ConfigParameterTypes.BOOL)
            expect(boolParam1.defaultValue).toBe(true);
            expect(boolParam1.currentValue).toBe(true);
        }

        const stringParam1 = appConfiguration.getParam("stringParam1");
        expect(stringParam1).not.toBeNull()
        if(stringParam1) { // to avoid typecript can be null check
            expect(stringParam1.name).toBe("stringParam1")
            expect(stringParam1.type).toBe(ConfigParameterTypes.STRING)
            expect(stringParam1.defaultValue).toBe("default val");
            expect(stringParam1.currentValue).toBe("default val");
        }

        const intParam1 = appConfiguration.getParam("intParam1");
        expect(intParam1).not.toBeNull()
        if(intParam1) { // to avoid typecript can be null check
            expect(intParam1.name).toBe("intParam1")
            expect(intParam1.type).toBe(ConfigParameterTypes.INT_NUMBER)
            expect(intParam1.defaultValue).toBe(5);
            expect(intParam1.currentValue).toBe(5);
        }

        const floatParam1 = appConfiguration.getParam("floatParam1");
        expect(floatParam1).not.toBeNull()
        if(floatParam1) { // to avoid typecript can be null check
            expect(floatParam1.name).toBe("floatParam1")
            expect(floatParam1.type).toBe(ConfigParameterTypes.FLOAT_NUMBER)
            expect(floatParam1.defaultValue).toBe(3.1415);
            expect(floatParam1.currentValue).toBe(3.1415);
        }
    });

    test('Test feature flags - defaults and current values', async () => {
        const featureFlag1 = appConfiguration.getFeatureFlag("featureFlag1");
        expect(featureFlag1).not.toBeNull()
        if(featureFlag1) { // to avoid typecript can be null check
            expect(featureFlag1.name).toBe("featureFlag1")
            expect(featureFlag1.defaultValue).toBe(false);
            expect(featureFlag1.currentValue).toBe(false);
        }
    });

    test('Test secrets - defaults and current values', async () => {
        const secret1 = appConfiguration.getSecret("secret1");
        expect(secret1).not.toBeNull()
        if(secret1) { // to avoid typecript can be null check
            expect(secret1.name).toBe("secret1")
            expect(secret1.defaultValue).toBe("password");
            expect(secret1.currentValue).toBe("password");
        }
    });


    test('Test params - set value', async () => {
        appConfiguration.setParamValue("boolParam1", false);
        const boolParam1 = appConfiguration.getParam("boolParam1");
        expect(boolParam1).not.toBeNull()
        if(boolParam1) { // to avoid typecript can be null check
            expect(boolParam1.type).toBe(ConfigParameterTypes.BOOL)
            expect(boolParam1.defaultValue).toBe(true);
            expect(boolParam1.currentValue).toBe(false);
        }

        appConfiguration.setParamValue("stringParam1", "new val");
        const stringParam1 = appConfiguration.getParam("stringParam1");
        expect(stringParam1).not.toBeNull()
        if(stringParam1) { // to avoid typecript can be null check
            expect(stringParam1.name).toBe("stringParam1")
            expect(stringParam1.type).toBe(ConfigParameterTypes.STRING)
            expect(stringParam1.defaultValue).toBe("default val");
            expect(stringParam1.currentValue).toBe("new val");
        }

        appConfiguration.setParamValue("intParam1", 10);
        const intParam1 = appConfiguration.getParam("intParam1");
        expect(intParam1).not.toBeNull()
        if(intParam1) { // to avoid typecript can be null check
            expect(intParam1.name).toBe("intParam1")
            expect(intParam1.type).toBe(ConfigParameterTypes.INT_NUMBER)
            expect(intParam1.defaultValue).toBe(5);
            expect(intParam1.currentValue).toBe(10);
        }

        appConfiguration.setParamValue("floatParam1", 1.618);
        const floatParam1 = appConfiguration.getParam("floatParam1");
        expect(floatParam1).not.toBeNull()
        if(floatParam1) { // to avoid typecript can be null check
            expect(floatParam1.name).toBe("floatParam1")
            expect(floatParam1.type).toBe(ConfigParameterTypes.FLOAT_NUMBER)
            expect(floatParam1.defaultValue).toBe(3.1415);
            expect(floatParam1.currentValue).toBe(1.618);
        }
    });

    test('Test feature flags - set value', async () => {
        appConfiguration.setFeatureFlagValue("featureFlag1", true);
        const featureFlag1 = appConfiguration.getFeatureFlag("featureFlag1");
        expect(featureFlag1).not.toBeNull()
        if(featureFlag1) { // to avoid typecript can be null check
            expect(featureFlag1.name).toBe("featureFlag1")
            expect(featureFlag1.defaultValue).toBe(false);
            expect(featureFlag1.currentValue).toBe(true);
        }
    });

    test('Test secrets - set value', async () => {
        appConfiguration.setSecretValue("secret1", "evenbetterpass");
        const secret1 = appConfiguration.getSecret("secret1");
        expect(secret1).not.toBeNull()
        if(secret1) { // to avoid typecript can be null check
            expect(secret1.name).toBe("secret1")
            expect(secret1.defaultValue).toBe("password");
            expect(secret1.currentValue).toBe("evenbetterpass");
        }
    });

    /*  test('fetch', async () => {
        await appConfiguration.fetch();

     })*/
})
