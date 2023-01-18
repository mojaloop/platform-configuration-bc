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

import {WriteGlobalConfigurationSet} from "./local_types";
import {ConfigParameterTypes} from "@mojaloop/platform-configuration-bc-types-lib";

// TODO this should be on a separate file
import currencies from "./list_files/currencies.json";


export function setSchema(globalConfigSet:WriteGlobalConfigurationSet):void{
    //////////////////////////////
    // Add Parameters to the schema here

    globalConfigSet.parameters.push({
        name: "currencies",
        type: ConfigParameterTypes.LIST,
        defaultValue: currencies,
        description: "Global Currencies list in format: {code: string, decimals: number}"
    });

    globalConfigSet.parameters.push({
        name: "boolParam1",
        type: ConfigParameterTypes.BOOL,
        defaultValue: true,
        description: "description bool param 1"
    });

    //////////////////////////////
    // Add Feature Flags to the schema here

    globalConfigSet.featureFlags.push({
        name: "globalFeatureFlag1",
        defaultValue: true,
        description: "description for globalFeatureFlag1"
    });

    //////////////////////////////
    // Add Secrets to the schema here

    globalConfigSet.secrets.push({
        name: "globalSecret 1",
        defaultValue: "super secret",
        description: "description for globalSecret 1"
    });
}
