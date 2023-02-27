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
	ConfigFeatureFlag,
	ConfigParameter,
	ConfigParameterTypes,
	ConfigSecret
} from "./general_config_types";

export interface IConfigurationClient {
	get environmentName(): string;
	get boundedContextName(): string;
	get applicationName(): string;
	get applicationVersion(): string;
	get appConfigs(): IAppConfiguration;
	get globalConfigs(): IGlobalConfiguration;

	init(): Promise<void>;
	fetch(): Promise<void>;
	bootstrap(ignoreDuplicateError?: boolean): Promise<boolean>;
}

export interface IGlobalConfiguration {
	schemaVersion: string;
	iterationNumber: number;

	has(name: string): boolean;
	allKeys(): string[];
	getParam(paramName: string): ConfigParameter | null;
	getAllParams(): ConfigParameter[];
	getFeatureFlag(featureFlagName: string): ConfigFeatureFlag | null;
	getAllFeatureFlags(): ConfigFeatureFlag[];
	getSecret(secretName: string): ConfigSecret | null;
	getAllSecrets(): ConfigSecret[];
}

export interface IAppConfiguration extends IGlobalConfiguration {
	addParam(param: ConfigParameter): void;
	addNewParam(name: string, type: ConfigParameterTypes, defaultValue: any, description: string): void;
	addFeatureFlag(featureFlag: ConfigFeatureFlag): void;
	addNewFeatureFlag(name: string, defaultValue: boolean, description: string): void;
	addSecret(secret: ConfigSecret): void;
	addNewSecret(name: string, defaultValue: string | null, description: string): void;
}