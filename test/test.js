/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 --------------
 ******/

"use strict";

import {ConsoleLogger} from "@mojaloop/logging-bc-public-types-lib";
import {AuthenticatedHttpRequester} from "@mojaloop/security-bc-client-lib";
import {MLKafkaJsonConsumer} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {ConfigurationClient, DefaultConfigProvider} from "../packages/client-lib/dist/index.js";
import {ConfigParameterTypes} from "../packages/public-types-lib/dist/index.js";
import process from "process";

/****/

// IAuthenticatedHttpRequester consts
const AUTH_TOKEN_ENPOINT = "http://localhost:3201/token";
const CLIENT_ID = "platform-configuration-bc-api-svc";     // always required
const CLIENT_SECRET = "superServiceSecret";  // only needed for app logins (client_credentials grant)

const logger = new ConsoleLogger();

// create the instance of IAuthenticatedHttpRequester
const authRequester = new AuthenticatedHttpRequester(logger, AUTH_TOKEN_ENPOINT);
authRequester.setAppCredentials(CLIENT_ID, CLIENT_SECRET);

const consumer = new MLKafkaJsonConsumer({kafkaBrokerList: "localhost:9092", kafkaGroupId: "test"}, logger);

const provider = new DefaultConfigProvider(authRequester, consumer, "http://localhost:3100");
const configClient = new ConfigurationClient("consolebc", "0.1.1", provider);

configClient.bcConfigs.addNewParam("param1", ConfigParameterTypes.OBJECT, "default", "desc")

console.log("Init...");
await configClient.init();

console.log("Bootstrap...");
await configClient.bootstrap();

console.log("Fetch...");
await configClient.fetch();

console.log();
console.log("Initial values: ");
console.log(configClient.bcConfigs.getParam("param1").currentValue);
console.log(configClient.globalConfigs.getParam("boolParam1").currentValue);
console.log();
console.log("Global fixed values: ");
console.log("Currencies: ");
console.log(configClient.globalConfigs.getCurrencies());
console.log();

configClient.setChangeHandlerFunction((arg)=>{
    console.log("changed values: ");
    console.log(arg);
    console.log(configClient.bcConfigs.getParam("param1").currentValue);
    console.log(configClient.globalConfigs.getParam("boolParam1").currentValue);
    console.log(configClient.globalConfigs.getCurrencies())
    console.log();
});

console.log("started");


process.on("SIGINT", async ()=>{
    await configClient.destroy();
    await consumer.destroy();
});
