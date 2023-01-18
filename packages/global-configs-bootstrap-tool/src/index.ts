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
import {
    GLOBALCONFIGSET_URL_RESOURCE_NAME
} from "@mojaloop/platform-configuration-bc-types-lib";

import {ConsoleLogger, ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {ConfigurationHttpClient} from "./http_client";
import {setSchema} from "./global_config_schema";
import {WriteGlobalConfigurationSet} from "./local_types";

const ENV_NAME = process.env["ENV_NAME"] || "dev";
const CONFIG_SVC_BASEURL = process.env["CONFIG_SVC_BASEURL"] || "http://localhost:3100";

const logger: ILogger = new ConsoleLogger();

/**
 * Instructions
 * - Add the necessary params, featureFlags or secrets to the schema in the <global_config_schema.ts> file
 * - Increase the CONFIGSET_VERSION (see bellow how)
 *
 * How to increase the CONFIGSET_VERSION accordingly on every change:
 * - Increase patch number for minor fixes (ex: changed default values or descriptions)
 * - Increase minor number for new configurations (adding only)
 * - Increase major number only in the case of a different schema types, likely from different platform version, ex: going from 1.0.0 to 2.0.0
 *
 * NOTE: for production usages:
 * - NEVER make changes to param names or types
 * - NEVER remove params, add a disabled note to its description
 */
const CONFIGSET_VERSION = "0.1.3";

// create an empty write only version of the global configuration set schema
const globalConfigSet:WriteGlobalConfigurationSet = {
    environmentName: ENV_NAME,
    schemaVersion: CONFIGSET_VERSION,
    parameters: [],
    featureFlags: [],
    secrets: []
};

// add the params, feature flags and secrets to the global configuration set schema
setSchema(globalConfigSet);

// send the global configuration set schema to the central service for storage
logger.info(`global-configs-bootstrap-tool - going to boostrap configSet with: 
\n\t- env name: ${globalConfigSet.environmentName} \
\n\t- schema version: ${globalConfigSet.schemaVersion} \
\n\t- ${globalConfigSet.parameters.length} parameter(s) \
\n\t- ${globalConfigSet.featureFlags.length} featureFlags(s) \
\n\t- ${globalConfigSet.secrets.length} secrets(s) \
\nTo "${CONFIG_SVC_BASEURL}/${GLOBALCONFIGSET_URL_RESOURCE_NAME}"...`);

const configClient = new ConfigurationHttpClient(CONFIG_SVC_BASEURL, GLOBALCONFIGSET_URL_RESOURCE_NAME, logger);

configClient.boostrapGlobalConfigs(globalConfigSet).then((success:boolean)=> {
    if(success){
        logger.info("Successfully bootstrapped the global configuration schema");
        process.exit(0);
        return;
    }
    logger.info("Failed to bootstrap the global configuration schema");
    process.exit(1);
}).catch((err)=>{
    logger.error(err, "Unhandled error trying to bootstrap the global configuration schema");
    process.exit(9);
});

