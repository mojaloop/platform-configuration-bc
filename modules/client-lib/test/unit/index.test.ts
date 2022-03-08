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
        expect(defaultConfigProvider).toBeDefined()
        expect(defaultConfigProvider).not.toBeNull()

        configSet = new ConfigurationSet(BC_NAME, APP_NAME, CONFIGSET_VERSION, defaultConfigProvider);
        expect(configSet).not.toBeNull()
        expect(configSet.getAllParams().length).toEqual(0);
        expect(configSet.getAllFeatureFlags().length).toEqual(0);
        expect(configSet.getAllSecrets().length).toEqual(0);

        /// params
        configSet.addNewParam("boolParam1", ConfigParameterTypes.BOOL, true, "description bool param 1 - v"+CONFIGSET_VERSION);
        expect(configSet.getAllParams().length).toEqual(1);
        configSet.addNewParam("stringParam1", ConfigParameterTypes.STRING, "default val", "description string param 1 - v"+CONFIGSET_VERSION);
        expect(configSet.getAllParams().length).toEqual(2);
        configSet.addNewParam("intParam1", ConfigParameterTypes.INT_NUMBER, 5, "description int number param 1 - v"+CONFIGSET_VERSION);
        expect(configSet.getAllParams().length).toEqual(3);
        configSet.addNewParam("floatParam1", ConfigParameterTypes.FLOAT_NUMBER, 3.1415, "description float number param 1 - v"+CONFIGSET_VERSION);
        expect(configSet.getAllParams().length).toEqual(4);

        /// feature flags
        configSet.addNewFeatureFlag("featureFlag1", false, "description feature flag 1 - v"+CONFIGSET_VERSION);
        expect(configSet.getAllFeatureFlags().length).toEqual(1);

        /// secrets
        configSet.addNewSecret("secret1", "password", "description secret 1 - v"+CONFIGSET_VERSION);
        expect(configSet.getAllSecrets().length).toEqual(1);

        //console.log(configSet.toJsonObj());

        expect(configSet.versionNumber).toBe(CONFIGSET_VERSION);
        expect(configSet.patchNumber).toBe(0);
    });


    test('Test params - defaults and current values', async () => {
        const boolParam1 = configSet.getParam("boolParam1");
        expect(boolParam1).not.toBeNull()
        if(boolParam1) { // to avoid typecript can be null check
            expect(boolParam1.name).toBe("boolParam1")
            expect(boolParam1.type).toBe(ConfigParameterTypes.BOOL)
            expect(boolParam1.defaultValue).toBe(true);
            expect(boolParam1.currentValue).toBe(true);
        }

        const stringParam1 = configSet.getParam("stringParam1");
        expect(stringParam1).not.toBeNull()
        if(stringParam1) { // to avoid typecript can be null check
            expect(stringParam1.name).toBe("stringParam1")
            expect(stringParam1.type).toBe(ConfigParameterTypes.STRING)
            expect(stringParam1.defaultValue).toBe("default val");
            expect(stringParam1.currentValue).toBe("default val");
        }

        const intParam1 = configSet.getParam("intParam1");
        expect(intParam1).not.toBeNull()
        if(intParam1) { // to avoid typecript can be null check
            expect(intParam1.name).toBe("intParam1")
            expect(intParam1.type).toBe(ConfigParameterTypes.INT_NUMBER)
            expect(intParam1.defaultValue).toBe(5);
            expect(intParam1.currentValue).toBe(5);
        }

        const floatParam1 = configSet.getParam("floatParam1");
        expect(floatParam1).not.toBeNull()
        if(floatParam1) { // to avoid typecript can be null check
            expect(floatParam1.name).toBe("floatParam1")
            expect(floatParam1.type).toBe(ConfigParameterTypes.FLOAT_NUMBER)
            expect(floatParam1.defaultValue).toBe(3.1415);
            expect(floatParam1.currentValue).toBe(3.1415);
        }
    });

    test('Test feature flags - defaults and current values', async () => {
        const featureFlag1 = configSet.getFeatureFlag("featureFlag1");
        expect(featureFlag1).not.toBeNull()
        if(featureFlag1) { // to avoid typecript can be null check
            expect(featureFlag1.name).toBe("featureFlag1")
            expect(featureFlag1.defaultValue).toBe(false);
            expect(featureFlag1.currentValue).toBe(false);
        }
    });

    test('Test secrets - defaults and current values', async () => {
        const secret1 = configSet.getSecret("secret1");
        expect(secret1).not.toBeNull()
        if(secret1) { // to avoid typecript can be null check
            expect(secret1.name).toBe("secret1")
            expect(secret1.defaultValue).toBe("password");
            expect(secret1.currentValue).toBe("password");
        }
    });


    test('Test params - set value', async () => {
        configSet.setParamValue("boolParam1", false);
        const boolParam1 = configSet.getParam("boolParam1");
        expect(boolParam1).not.toBeNull()
        if(boolParam1) { // to avoid typecript can be null check
            expect(boolParam1.type).toBe(ConfigParameterTypes.BOOL)
            expect(boolParam1.defaultValue).toBe(true);
            expect(boolParam1.currentValue).toBe(false);
        }

        configSet.setParamValue("stringParam1", "new val");
        const stringParam1 = configSet.getParam("stringParam1");
        expect(stringParam1).not.toBeNull()
        if(stringParam1) { // to avoid typecript can be null check
            expect(stringParam1.name).toBe("stringParam1")
            expect(stringParam1.type).toBe(ConfigParameterTypes.STRING)
            expect(stringParam1.defaultValue).toBe("default val");
            expect(stringParam1.currentValue).toBe("new val");
        }

        configSet.setParamValue("intParam1", 10);
        const intParam1 = configSet.getParam("intParam1");
        expect(intParam1).not.toBeNull()
        if(intParam1) { // to avoid typecript can be null check
            expect(intParam1.name).toBe("intParam1")
            expect(intParam1.type).toBe(ConfigParameterTypes.INT_NUMBER)
            expect(intParam1.defaultValue).toBe(5);
            expect(intParam1.currentValue).toBe(10);
        }

        configSet.setParamValue("floatParam1", 1.618);
        const floatParam1 = configSet.getParam("floatParam1");
        expect(floatParam1).not.toBeNull()
        if(floatParam1) { // to avoid typecript can be null check
            expect(floatParam1.name).toBe("floatParam1")
            expect(floatParam1.type).toBe(ConfigParameterTypes.FLOAT_NUMBER)
            expect(floatParam1.defaultValue).toBe(3.1415);
            expect(floatParam1.currentValue).toBe(1.618);
        }
    });

    test('Test feature flags - set value', async () => {
        configSet.setFeatureFlagValue("featureFlag1", true);
        const featureFlag1 = configSet.getFeatureFlag("featureFlag1");
        expect(featureFlag1).not.toBeNull()
        if(featureFlag1) { // to avoid typecript can be null check
            expect(featureFlag1.name).toBe("featureFlag1")
            expect(featureFlag1.defaultValue).toBe(false);
            expect(featureFlag1.currentValue).toBe(true);
        }
    });

    test('Test secrets - set value', async () => {
        configSet.setSecretValue("secret1", "evenbetterpass");
        const secret1 = configSet.getSecret("secret1");
        expect(secret1).not.toBeNull()
        if(secret1) { // to avoid typecript can be null check
            expect(secret1.name).toBe("secret1")
            expect(secret1.defaultValue).toBe("password");
            expect(secret1.currentValue).toBe("evenbetterpass");
        }
    });

    /*  test('fetch', async () => {
        await configSet.fetch();

     })*/
})
