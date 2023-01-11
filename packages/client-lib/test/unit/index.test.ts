"use strict"

import {ConfigParameterTypes} from "@mojaloop/platform-configuration-bc-types-lib";
import {ConfigurationClient, DefaultConfigProvider} from "../../src/";

const ENV_NAME = "dev";
const BC_NAME = "platform-configuration";
const APP_NAME = "platform-configuration-client-lib";
const APP_VERSION = "0.0.1";
const CONFIGSET_VERSION = "0.0.1";
const CONFIG_SVC_BASEURL = "http://localhost:3100";

let configClient: ConfigurationClient;
let defaultConfigProvider: DefaultConfigProvider;

// const logger: ILogger = new ConsoleLogger();

describe("client-lib ConfigurationSet tests", () => {
    beforeAll(async () => {
        // Setup
        // defaultConfigProvider = new DefaultConfigProvider(CONFIG_SVC_BASEURL);
        // expect(defaultConfigProvider).toBeDefined()
        // expect(defaultConfigProvider).not.toBeNull()
        //
        // configClient = new ConfigurationClient(ENV_NAME, BC_NAME, APP_NAME, APP_VERSION, CONFIGSET_VERSION, defaultConfigProvider);
        //configClient = new ConfigurationClient(ENV_NAME, BC_NAME, APP_NAME, APP_VERSION, CONFIGSET_VERSION);
    })

    afterAll(async () => {
        // Cleanup
    })

    test("AppConfiguration - Create", async () => {
        configClient = new ConfigurationClient(ENV_NAME, BC_NAME, APP_NAME, APP_VERSION, CONFIGSET_VERSION);
        expect(configClient).not.toBeNull()
        expect(configClient.appConfigs.getAllParams().length).toEqual(0);
        expect(configClient.appConfigs.getAllFeatureFlags().length).toEqual(0);
        expect(configClient.appConfigs.getAllSecrets().length).toEqual(0);

        /// params
        configClient.appConfigs.addNewParam("boolParam1", ConfigParameterTypes.BOOL, true, "description bool param 1 - v"+CONFIGSET_VERSION);
        expect(configClient.appConfigs.getAllParams().length).toEqual(1);
        configClient.appConfigs.addNewParam("stringParam1", ConfigParameterTypes.STRING, "default val", "description string param 1 - v"+CONFIGSET_VERSION);
        expect(configClient.appConfigs.getAllParams().length).toEqual(2);
        configClient.appConfigs.addNewParam("intParam1", ConfigParameterTypes.INT_NUMBER, 5, "description int number param 1 - v"+CONFIGSET_VERSION);
        expect(configClient.appConfigs.getAllParams().length).toEqual(3);
        configClient.appConfigs.addNewParam("floatParam1", ConfigParameterTypes.FLOAT_NUMBER, 3.1415, "description float number param 1 - v"+CONFIGSET_VERSION);
        expect(configClient.appConfigs.getAllParams().length).toEqual(4);

        /// feature flags
        configClient.appConfigs.addNewFeatureFlag("featureFlag1", false, "description feature flag 1 - v"+CONFIGSET_VERSION);
        expect(configClient.appConfigs.getAllFeatureFlags().length).toEqual(1);

        /// secrets
        configClient.appConfigs.addNewSecret("secret1", "password", "description secret 1 - v"+CONFIGSET_VERSION);
        expect(configClient.appConfigs.getAllSecrets().length).toEqual(1);

        //console.log(configClient.toJsonObj());

        expect(configClient.applicationVersion).toBe(CONFIGSET_VERSION);
        expect(configClient.appConfigs.iterationNumber).toBe(0);
    });


    test("AppConfiguration - params - defaults and current values", async () => {
        const boolParam1 = configClient.appConfigs.getParam("boolParam1");
        expect(boolParam1).not.toBeNull()
        if(boolParam1) { // to avoid typecript can be null check
            expect(boolParam1.name).toBe("boolParam1")
            expect(boolParam1.type).toBe(ConfigParameterTypes.BOOL)
            expect(boolParam1.defaultValue).toBe(true);
            expect(boolParam1.currentValue).toBe(true);
        }

        const stringParam1 = configClient.appConfigs.getParam("stringParam1");
        expect(stringParam1).not.toBeNull()
        if(stringParam1) { // to avoid typecript can be null check
            expect(stringParam1.name).toBe("stringParam1")
            expect(stringParam1.type).toBe(ConfigParameterTypes.STRING)
            expect(stringParam1.defaultValue).toBe("default val");
            expect(stringParam1.currentValue).toBe("default val");
        }

        const intParam1 = configClient.appConfigs.getParam("intParam1");
        expect(intParam1).not.toBeNull()
        if(intParam1) { // to avoid typecript can be null check
            expect(intParam1.name).toBe("intParam1")
            expect(intParam1.type).toBe(ConfigParameterTypes.INT_NUMBER)
            expect(intParam1.defaultValue).toBe(5);
            expect(intParam1.currentValue).toBe(5);
        }

        const floatParam1 = configClient.appConfigs.getParam("floatParam1");
        expect(floatParam1).not.toBeNull()
        if(floatParam1) { // to avoid typecript can be null check
            expect(floatParam1.name).toBe("floatParam1")
            expect(floatParam1.type).toBe(ConfigParameterTypes.FLOAT_NUMBER)
            expect(floatParam1.defaultValue).toBe(3.1415);
            expect(floatParam1.currentValue).toBe(3.1415);
        }
    });


    test("AppConfiguration - feature flags - defaults and current values", async () => {
        const featureFlag1 = configClient.appConfigs.getFeatureFlag("featureFlag1");
        expect(featureFlag1).not.toBeNull()
        if(featureFlag1) { // to avoid typecript can be null check
            expect(featureFlag1.name).toBe("featureFlag1")
            expect(featureFlag1.defaultValue).toBe(false);
            expect(featureFlag1.currentValue).toBe(false);
        }
    });

    test("AppConfiguration - secrets - defaults and current values", async () => {
        const secret1 = configClient.appConfigs.getSecret("secret1");
        expect(secret1).not.toBeNull()
        if(secret1) { // to avoid typecript can be null check
            expect(secret1.name).toBe("secret1")
            expect(secret1.defaultValue).toBe("password");
            expect(secret1.currentValue).toBe("password");
        }
    });

    test("Test EnvVars", async () => {
        process.env["ML_APP_BOOLPARAM1"] = "true";
        process.env["ML_APP_STRINGPARAM1"] = "env var value";
        process.env["ML_APP_INTPARAM1"] = "42";
        process.env["ML_APP_FLOATPARAM1"] = "3.1415";
        process.env["ML_APP_FEATUREFLAG1"] = "true";
        process.env["ML_APP_SECRET1"] = "env var password";

        // env vars overrides are only loaded at init
        await configClient.init();

        const boolParam1 = configClient.appConfigs.getParam("boolParam1");
        expect(boolParam1).not.toBeNull()
        expect(boolParam1!.currentValue).toBe(true);

        const stringParam1 = configClient.appConfigs.getParam("stringParam1");
        expect(stringParam1).not.toBeNull()
        expect(stringParam1!.currentValue).toBe("env var value");

        const intParam1 = configClient.appConfigs.getParam("intParam1");
        expect(intParam1).not.toBeNull()
        expect(intParam1!.currentValue).toBe(42);

        const floatParam1 = configClient.appConfigs.getParam("floatParam1");
        expect(floatParam1).not.toBeNull()
        expect(floatParam1!.currentValue).toBe(3.1415);

        const featureFlag1 = configClient.appConfigs.getFeatureFlag("featureFlag1");
        expect(featureFlag1).not.toBeNull()
        expect(featureFlag1!.currentValue).toBe(true);

        const secret1 = configClient.appConfigs.getSecret("secret1");
        expect(secret1).not.toBeNull()
        expect(secret1!.currentValue).toBe("env var password");
    });

    /*  test('fetch', async () => {
        await configClient.fetch();

     })*/
})
