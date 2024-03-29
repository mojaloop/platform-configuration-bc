"use strict";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import semver from "semver";
import * as process from "process";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {ConsoleLogger, ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {IMessageConsumer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {MLKafkaJsonConsumer, MLKafkaJsonProducer} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {
    PlatformConfigGlobalConfigsChangedEvt,
    PlatformConfigGlobalConfigsChangedEvtPayload
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {MockAuditClient} from "../mocks/mock_audit_client";

// must use relative path imports pointing to the src dirs of own repo packages
import {ConfigParameterTypes} from "../../packages/public-types-lib/src/";
import {ConfigurationClient, DefaultConfigProvider} from "../../packages/client-lib/src/";

// It is import to change the env var here before importing the Service (which reads it)
process.env["CONFIG_REPO_STORAGE_FILE_PATH"] = join(tmpdir(), "configSetRepoTempStorageFile.json");
import {Service} from "../../packages/configuration-svc/src/application/service";

jest.setTimeout(30000); // 60 secs - change this to suit the test (ms)

const ENV_NAME = "dev";
const BC_NAME = "platform-configuration";
const SCHEMA_VERSION = "0.0.1";
const CONFIG_SVC_BASEURL = "http://localhost:3100";
const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";

let configClient: ConfigurationClient;
let defaultConfigProvider: DefaultConfigProvider;

const logger: ILogger = new ConsoleLogger();

describe("client-lib ConfigurationSet tests", () => {
    beforeAll(async () => {
        // setup the service - mock only the logger and the audit client
        await Service.start(logger, new MockAuditClient(logger));

        // Setup the client
        defaultConfigProvider = new DefaultConfigProvider(CONFIG_SVC_BASEURL);
        expect(defaultConfigProvider).toBeDefined()
        expect(defaultConfigProvider).not.toBeNull()

        configClient = new ConfigurationClient(ENV_NAME, BC_NAME, SCHEMA_VERSION, defaultConfigProvider);
        //configClient = new ConfigurationClient(ENV_NAME, BC_NAME, APP_NAME, APP_VERSION, SCHEMA_VERSION);

        const ver = new semver.SemVer("0.1.0");
        console.log(ver);
    })

    afterAll(async () => {
        // Cleanup
        await configClient.destroy();
        await Service.stop();
    })

    test("BoundedContextConfiguration - create schema", async () => {

        expect(configClient).not.toBeNull()
        expect(configClient.bcConfigs.getAllParams().length).toEqual(0);
        expect(configClient.bcConfigs.getAllFeatureFlags().length).toEqual(0);
        expect(configClient.bcConfigs.getAllSecrets().length).toEqual(0);

        /// params
        configClient.bcConfigs.addNewParam("boolParam1", ConfigParameterTypes.BOOL, true, "description bool param 1 - v" + SCHEMA_VERSION);
        expect(configClient.bcConfigs.getAllParams().length).toEqual(1);
        configClient.bcConfigs.addNewParam("stringParam1", ConfigParameterTypes.STRING, "default val", "description string param 1 - v" + SCHEMA_VERSION);
        expect(configClient.bcConfigs.getAllParams().length).toEqual(2);
        configClient.bcConfigs.addNewParam("intParam1", ConfigParameterTypes.INT_NUMBER, 5, "description int number param 1 - v" + SCHEMA_VERSION);
        expect(configClient.bcConfigs.getAllParams().length).toEqual(3);
        configClient.bcConfigs.addNewParam("floatParam1", ConfigParameterTypes.FLOAT_NUMBER, 3.1415, "description float number param 1 - v" + SCHEMA_VERSION);
        expect(configClient.bcConfigs.getAllParams().length).toEqual(4);

        /// feature flags
        configClient.bcConfigs.addNewFeatureFlag("featureFlag1", false, "description feature flag 1 - v" + SCHEMA_VERSION);
        expect(configClient.bcConfigs.getAllFeatureFlags().length).toEqual(1);

        /// secrets
        configClient.bcConfigs.addNewSecret("secret1", "password", "description secret 1 - v" + SCHEMA_VERSION);
        expect(configClient.bcConfigs.getAllSecrets().length).toEqual(1);

        //console.log(configClient.toJsonObj());

        expect(configClient.bcConfigs.schemaVersion).toBe(SCHEMA_VERSION);
        expect(configClient.bcConfigs.iterationNumber).toBe(0);
    });


    test("BoundedContextConfiguration - params - defaults and current values", async () => {
        const boolParam1 = configClient.bcConfigs.getParam("boolParam1");
        expect(boolParam1).not.toBeNull()
        if (boolParam1) { // to avoid typecript can be null check
            expect(boolParam1.name).toBe("boolParam1")
            expect(boolParam1.type).toBe(ConfigParameterTypes.BOOL)
            expect(boolParam1.defaultValue).toBe(true);
            expect(boolParam1.currentValue).toBe(true);
        }

        const stringParam1 = configClient.bcConfigs.getParam("stringParam1");
        expect(stringParam1).not.toBeNull()
        if (stringParam1) { // to avoid typecript can be null check
            expect(stringParam1.name).toBe("stringParam1")
            expect(stringParam1.type).toBe(ConfigParameterTypes.STRING)
            expect(stringParam1.defaultValue).toBe("default val");
            expect(stringParam1.currentValue).toBe("default val");
        }

        const intParam1 = configClient.bcConfigs.getParam("intParam1");
        expect(intParam1).not.toBeNull()
        if (intParam1) { // to avoid typecript can be null check
            expect(intParam1.name).toBe("intParam1")
            expect(intParam1.type).toBe(ConfigParameterTypes.INT_NUMBER)
            expect(intParam1.defaultValue).toBe(5);
            expect(intParam1.currentValue).toBe(5);
        }

        const floatParam1 = configClient.bcConfigs.getParam("floatParam1");
        expect(floatParam1).not.toBeNull()
        if (floatParam1) { // to avoid typecript can be null check
            expect(floatParam1.name).toBe("floatParam1")
            expect(floatParam1.type).toBe(ConfigParameterTypes.FLOAT_NUMBER)
            expect(floatParam1.defaultValue).toBe(3.1415);
            expect(floatParam1.currentValue).toBe(3.1415);
        }
    });


    test("BoundedContextConfiguration - feature flags - defaults and current values", async () => {
        const featureFlag1 = configClient.bcConfigs.getFeatureFlag("featureFlag1");
        expect(featureFlag1).not.toBeNull()
        if (featureFlag1) { // to avoid typecript can be null check
            expect(featureFlag1.name).toBe("featureFlag1")
            expect(featureFlag1.defaultValue).toBe(false);
            expect(featureFlag1.currentValue).toBe(false);
        }
    });

    test("BoundedContextConfiguration - secrets - defaults and current values", async () => {
        const secret1 = configClient.bcConfigs.getSecret("secret1");
        expect(secret1).not.toBeNull()
        if (secret1) { // to avoid typecript can be null check
            expect(secret1.name).toBe("secret1")
            expect(secret1.defaultValue).toBe("password");
            expect(secret1.currentValue).toBe("password");
        }
    });

    test("Test EnvVars", async () => {
        process.env["ML_BC_BOOLPARAM1"] = "true";
        process.env["ML_BC_STRINGPARAM1"] = "env var value";
        process.env["ML_BC_INTPARAM1"] = "42";
        process.env["ML_BC_FLOATPARAM1"] = "3.1415";
        process.env["ML_BC_FEATUREFLAG1"] = "true";
        process.env["ML_BC_SECRET1"] = "env var password";

        // env vars overrides are only loaded at init
        await configClient.init();

        const boolParam1 = configClient.bcConfigs.getParam("boolParam1");
        expect(boolParam1).not.toBeNull()
        expect(boolParam1!.currentValue).toBe(true);

        const stringParam1 = configClient.bcConfigs.getParam("stringParam1");
        expect(stringParam1).not.toBeNull()
        expect(stringParam1!.currentValue).toBe("env var value");

        const intParam1 = configClient.bcConfigs.getParam("intParam1");
        expect(intParam1).not.toBeNull()
        expect(intParam1!.currentValue).toBe(42);

        const floatParam1 = configClient.bcConfigs.getParam("floatParam1");
        expect(floatParam1).not.toBeNull()
        expect(floatParam1!.currentValue).toBe(3.1415);

        const featureFlag1 = configClient.bcConfigs.getFeatureFlag("featureFlag1");
        expect(featureFlag1).not.toBeNull()
        expect(featureFlag1!.currentValue).toBe(true);

        const secret1 = configClient.bcConfigs.getSecret("secret1");
        expect(secret1).not.toBeNull()
        expect(secret1!.currentValue).toBe("env var password");
    });

    /*  test('fetch', async () => {
        await configClient.fetch();

     })*/


    test("ConfigurationClient - Init, boostrap and fetch", async () => {
        await configClient.init();

        await configClient.bootstrap(true);

        // fetch
        await configClient.fetch();

        expect(configClient.bcConfigs).toBeDefined();
        expect(configClient.bcConfigs.schemaVersion).toEqual(SCHEMA_VERSION);
    })


    test("ConfigurationClient - event notification setup", async () => {
        // stop other
        await configClient.destroy();

        // Setup
        const messageConsumer: IMessageConsumer = new MLKafkaJsonConsumer({
            kafkaBrokerList: KAFKA_URL,
            kafkaGroupId: "ConfigurationClient_tests",
        }, logger);

        defaultConfigProvider = new DefaultConfigProvider(CONFIG_SVC_BASEURL, messageConsumer);

        expect(defaultConfigProvider).toBeDefined()
        expect(defaultConfigProvider).not.toBeNull()

        configClient = new ConfigurationClient(ENV_NAME, BC_NAME, SCHEMA_VERSION, defaultConfigProvider);

        await configClient.init();
    });

    test("ConfigurationClient - event notification event test", async () => {
        return new Promise<void>(async (resolve) => {
            let kafkaProducer: MLKafkaJsonProducer = new MLKafkaJsonProducer({
                kafkaBrokerList: KAFKA_URL,
                producerClientId: "ConfigurationClient_tests"
            }, logger);

            configClient.setChangeHandlerFunction(async (type: "BC" | "GLOBAL") => {
                expect(type).toEqual("GLOBAL");

                await kafkaProducer.destroy();

                resolve();
            });

            const payload: PlatformConfigGlobalConfigsChangedEvtPayload = {
                environmentName: ENV_NAME,
                schemaVersion: BC_NAME,
                iterationNumber: 0
            };

            const evt = new PlatformConfigGlobalConfigsChangedEvt(payload);

            await kafkaProducer.connect();
            await kafkaProducer.send(evt);
        });
    });
})
