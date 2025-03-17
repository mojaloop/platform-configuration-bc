/*****
License
--------------
Copyright © 2020-2025 Mojaloop Foundation
The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

Contributors
--------------
This is the official list of the Mojaloop project contributors for this file.
Names of the original copyright holders (individuals or organizations)
should be listed with a '*' in the first column. People who have
contributed from an organization can be listed under the organization
that actually holds the copyright for their contributions (see the
Mojaloop Foundation for an example). Those individuals should have
their names indented and be marked with a '-'. Email address can be added
optionally within square brackets <email>.

* Mojaloop Foundation
- Name Surname <name.surname@mojaloop.io>

* Crosslake
- Pedro Sousa Barreto <pedrob@crosslaketech.com>
*****/

"use strict";

import {
    ConfigFeatureFlag,
    ConfigParameter,
    ConfigParameterTypes,
    ConfigSecret,
} from "./general_config_types";
import {Currency} from "./global_fixed_params";

export interface IConfigurationClient {
	get boundedContextName(): string;
	get bcConfigs(): IBoundedContextConfigurationClient;
	get globalConfigs(): IGlobalConfigurationClient;

	init(): Promise<void>;
	destroy(): Promise<void>;
	fetch(): Promise<void>;
	bootstrap(ignoreDuplicateError?: boolean): Promise<boolean>;

    setChangeHandlerFunction(fn: (type:"BC"|"GLOBAL")=>void): void;
}

export interface IBaseConfigurationClient {
    schemaVersion: string;
    iterationNumber: number;

    // only reads are allowed on base/GlobalConfigurations
    has(name: string): boolean;
    allKeys(): string[];
    getParam(paramName: string): ConfigParameter | null;
    getAllParams(): ConfigParameter[];
    getFeatureFlag(featureFlagName: string): ConfigFeatureFlag | null;
    getAllFeatureFlags(): ConfigFeatureFlag[];
    getSecret(secretName: string): ConfigSecret | null;
    getAllSecrets(): ConfigSecret[];
}

// extend IBaseConfigurationClient specific for global
export interface IGlobalConfigurationClient extends IBaseConfigurationClient{
    // fixed global configs
    getCurrencies():Currency[];
}

// extend IBaseConfigurationClient specific for bounded context configs - client can write
export interface IBoundedContextConfigurationClient extends IBaseConfigurationClient {
	addParam(param: ConfigParameter): void;
	addNewParam(name: string, type: ConfigParameterTypes, defaultValue: any, description: string, jsonSchema?: string): void;
	addFeatureFlag(featureFlag: ConfigFeatureFlag): void;
	addNewFeatureFlag(name: string, defaultValue: boolean, description: string): void;
	addSecret(secret: ConfigSecret): void;
	addNewSecret(name: string, defaultValue: string | null, description: string): void;
}
