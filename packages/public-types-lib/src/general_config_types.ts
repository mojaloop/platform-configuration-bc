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

export const GLOBALCONFIGSET_URL_RESOURCE_NAME = "globalConfigSets";
export const BCCONFIGSET_URL_RESOURCE_NAME = "bcConfigSets";

/*
* Configuration items and types
* */

export enum ConfigParameterTypes {
    "STRING" = "STRING",
    "BOOL" = "BOOL",
    "INT_NUMBER" = "INT_NUMBER",
    "FLOAT_NUMBER" = "FLOAT_NUMBER",
    "LIST" = "LIST",
    "OBJECT" = "OBJECT",
}

export enum ConfigItemTypes {
    "PARAMETER" = "PARAMETER",
    "FEATUREFLAG" = "FEATUREFLAG",
    "SECRET" = "SECRET"
}

export type ConfigParameter = {
    name: string;
    type: ConfigParameterTypes;
    defaultValue: any;
    description: string;
    currentValue: any;
    // ajv schema string in JSON Type Definition format - for types list and object
    jsonSchema?: string;
}

export type ConfigFeatureFlag = {
    name: string;
    defaultValue: boolean;
    description: string;
    currentValue: boolean;
}

export type ConfigSecret = {
    name: string;
    defaultValue: string | null;
    description: string;
    currentValue: string;
}

/*
* ConfigurationSets
* */

export type ConfigurationSet = {
    environmentName: string;                        // target environment name
    schemaVersion: string;                          // config schema version (semver format)
    iterationNumber: number;                        // monotonic integer - increases on every configuration/values change
    parameters: ConfigParameter[];                  // parameter list
    featureFlags: ConfigFeatureFlag[];              // featureFlag list
    secrets: ConfigSecret[];                        // secret list
}


export type GlobalConfigurationSet = ConfigurationSet;

export type BoundedContextConfigurationSet = ConfigurationSet & {
    boundedContextName: string;                     // target bounded context
}

/*
* Environment - not used for now
* */

/*
export enum EnvironmentType {
    "DEVELOPMENT" = "DEVELOPMENT",
    "TESTING" = "TESTING",
    "STAGING" = "STAGING",
    "PRODUCTION" = "PRODUCTION"
}

export type Environment = {
    name:string;
    type:EnvironmentType;
}


export type ApplicationIdentifier = {
    boundedContextName: string;
    applicationName: string;
    version: string; // semver
}
*/
