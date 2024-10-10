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
import * as semver from "semver";
import {
    ConfigParameterTypes,
    GLOBAL_FIXED_PARAMETERS_DEFINITION, GlobalConfigurationSet
} from "@mojaloop/platform-configuration-bc-public-types-lib";


import {ConfigSetAggregate, IGlobalConfigSetRepository} from "@mojaloop/platform-configuration-bc-domain-lib";

// import from file
import currencies from "./json_files/currencies.json";
import process from "process";

export const GLOBAL_SCHEMA_VERSION = "0.0.1";

export async function bootstrapGlobalConfigSet(agg:ConfigSetAggregate, globalConfigRepo:IGlobalConfigSetRepository):Promise<void>{
    const currentGlobalConfigs = await globalConfigRepo.fetchLatestGlobalConfigSet();
    let shouldBootstrap = false;

    if(!currentGlobalConfigs){
        shouldBootstrap = true;
    }else if (semver.compare(GLOBAL_SCHEMA_VERSION, currentGlobalConfigs.schemaVersion) == 1){
        // GLOBAL_SCHEMA_VERSION is greater than latest found
        shouldBootstrap = true;
    }

    if(!shouldBootstrap) return;

    const globalConfigSet:GlobalConfigurationSet = {
        schemaVersion: GLOBAL_SCHEMA_VERSION,
        iterationNumber: 0,
        parameters: [],
        featureFlags: [],
        secrets: []
    };
    setSchema(globalConfigSet);

    await agg.bootstrapGlobalConfigSet(globalConfigSet);
    return Promise.resolve();
}

function setSchema(globalConfigSet:GlobalConfigurationSet):void{
    //////////////////////////////
    // Start with fixed parameters (defaults)

    let defaultCurrencies:any = currencies;

    if(process.env["DEFAULT_CURRENCIES"]){
        const envDefaultCurrenciesStr = process.env["DEFAULT_CURRENCIES"];
        defaultCurrencies = JSON.parse(envDefaultCurrenciesStr);
    }

    globalConfigSet.parameters.push({
        name: GLOBAL_FIXED_PARAMETERS_DEFINITION.CURRENCIES.name,
        type: GLOBAL_FIXED_PARAMETERS_DEFINITION.CURRENCIES.type,
        description: GLOBAL_FIXED_PARAMETERS_DEFINITION.CURRENCIES.description,
        jsonSchema: GLOBAL_FIXED_PARAMETERS_DEFINITION.CURRENCIES.jtdSchema,
        defaultValue: defaultCurrencies,
        currentValue: null
    });

    //////////////////////////////
    // Add Parameters to the schema here

    globalConfigSet.parameters.push({
        name: "boolParam1",
        type: ConfigParameterTypes.BOOL,
        defaultValue: true,
        description: "description bool param 1",
        currentValue: null
    });

    //////////////////////////////
    // Add Feature Flags to the schema here

    globalConfigSet.featureFlags.push({
        name: "globalFeatureFlag1",
        defaultValue: true,
        description: "description for globalFeatureFlag1",
        currentValue: true
    });

    //////////////////////////////
    // Add Secrets to the schema here

    globalConfigSet.secrets.push({
        name: "globalSecret 1",
        defaultValue: "super secret",
        description: "description for globalSecret 1",
        currentValue: "super secret"
    });
}
