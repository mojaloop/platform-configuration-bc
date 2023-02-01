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

import {AppConfigurationSet, GlobalConfigurationSet} from "@mojaloop/platform-configuration-bc-public-types-lib";

export interface IAppConfigSetRepository {
    init():Promise<void>;

    // app config set specific
    storeAppConfigSet(configSet:AppConfigurationSet):Promise<boolean>;
    fetchAllAppConfigSets(envName:string):Promise<AppConfigurationSet[]>;
    fetchLatestAppConfigSet(envName:string, bcName:string, appName:string):Promise<AppConfigurationSet | null>;
    fetchAppConfigSetVersion(envName:string, bcName:string, appName:string, version:string):Promise<AppConfigurationSet | null>;
}

export interface IGlobalConfigSetRepository {
    init():Promise<void>;

    // global config set specific
    storeGlobalConfigSet(configSet:GlobalConfigurationSet):Promise<boolean>;
    fetchGlobalAppConfigSets(envName:string):Promise<GlobalConfigurationSet[]>;
    fetchLatestGlobalConfigSet(envName:string):Promise<GlobalConfigurationSet | null>;
    fetchGlobalConfigSetVersion(envName:string, version:string):Promise<GlobalConfigurationSet | null>;
}
