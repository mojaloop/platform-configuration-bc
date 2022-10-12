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

"use strict"

import process from "process";
import {IConfigProvider} from "./iconfig_provider";
import {ConfigurationSetWrapper} from "./configurationset_wrapper";
import {IAppConfiguration, IGlobalConfiguration} from "./configuration_interfaces";
import {AppConfigurationSet, GlobalConfigurationSet } from "@mojaloop/platform-configuration-bc-types-lib";

// name of the env var that if present disables remote fetch (uses only env vars or defaults)
const STANDALONE_ENV_VAR_NAME = "PLATFORM_CONFIG_STANDALONE";
const ENV_VAR_APP_OVERRIDE_PREFIX = "ML_APP_";
const ENV_VAR_GLOBAL_OVERRIDE_PREFIX = "ML_GLOBAL_";

export class ConfigurationClient {
    private readonly _configProvider:IConfigProvider | null;
    private readonly _environmentName: string;
    private readonly _boundedContextName: string;
    private readonly _applicationName: string;
    private readonly _applicationVersion: string;
    private readonly _standAloneMode: boolean = false;
    private readonly _appConfigs:ConfigurationSetWrapper;
    private readonly _globalConfigs:ConfigurationSetWrapper;

    constructor(environmentName: string, boundedContext: string, application: string, appVersion: string, appConfigSchemaVersion:string, configProvider:IConfigProvider | null = null) {
        this._configProvider = configProvider;
        this._environmentName = environmentName;

        // TODO: validate params

        this._boundedContextName = boundedContext;
        this._applicationName = application;
        this._applicationVersion = appVersion;

        this._standAloneMode = configProvider === null || process.env[STANDALONE_ENV_VAR_NAME] != undefined;

        this._appConfigs = new ConfigurationSetWrapper(environmentName, appConfigSchemaVersion);
        this._globalConfigs = new ConfigurationSetWrapper(environmentName);
    }

    get environmentName(): string {
        return this._environmentName;
    }

    get boundedContextName(): string {
        return this._boundedContextName;
    }

    get applicationName(): string {
        return this._applicationName;
    }

    get applicationVersion(): string {
        return this._applicationVersion;
    }

    get appConfigs():IAppConfiguration{
        return this._appConfigs;
    }

    get globalConfigs():IGlobalConfiguration{
        return this._globalConfigs;
    }

    async init(): Promise<void>{
        if(!this._standAloneMode){
            await this._configProvider!.init();
        }

        this._appConfigs.ApplyFromEnvVars(ENV_VAR_APP_OVERRIDE_PREFIX);
        this._globalConfigs.ApplyFromEnvVars(ENV_VAR_GLOBAL_OVERRIDE_PREFIX);
    }

    async fetch(): Promise<void>{
        await this._fetchApp();
        await this._fetchGlobal();
    }

    private async _fetchGlobal(): Promise<void>{
        if(this._standAloneMode)
            return;

        let globalConfigSetDto: GlobalConfigurationSet | null = null;
        try {
            globalConfigSetDto = await this._configProvider!.fetchGlobalConfigs(this._environmentName);
        }catch(err:any){
            throw new Error(`Could not fetch GlobalConfigurationSet for ENV: ${this._environmentName} - ${err?.message}`);
        }

        if(!globalConfigSetDto){
            // no global config found
            return;
        }

        if(globalConfigSetDto.environmentName !== this._environmentName){
            throw new Error("Received GlobalConfigurationSet doesn't match current configuration (env name or schema version)");
        }

        this._globalConfigs.SetFromJsonObj(globalConfigSetDto);

        this._globalConfigs.ApplyFromEnvVars(ENV_VAR_GLOBAL_OVERRIDE_PREFIX); // env vars always take priority
    }

    private async _fetchApp(): Promise<void>{
        if(this._standAloneMode)
            return;

        const appConfigSetDto:AppConfigurationSet|null = await this._configProvider!.fetchAppConfigs(this._environmentName, this._boundedContextName, this._applicationName, this._appConfigs.schemaVersion);
        if(!appConfigSetDto){
            // TODO log
            throw new Error(`Could not fetch AppConfigurationSet for ENV: ${this._environmentName} - BC: ${this._boundedContextName} - APP: ${this._applicationName} - APP_SCHEMA_VERSION: ${this._appConfigs.schemaVersion}`);
        }

        if(appConfigSetDto.environmentName !== this._environmentName ||
                appConfigSetDto.schemaVersion !== this._appConfigs.schemaVersion ||
                appConfigSetDto.applicationName !== this._applicationName ||
                appConfigSetDto.boundedContextName !== this._boundedContextName){
            throw new Error("Received AppConfiguration doesn't match current configuration (env name, schema version, app name, bc name or app version)");
        }

        this._appConfigs.SetFromJsonObj(appConfigSetDto);

        this._appConfigs.ApplyFromEnvVars(ENV_VAR_APP_OVERRIDE_PREFIX); // env vars always take priority
    }

    async bootstrap(ignoreDuplicateError = false): Promise<boolean>{
        if(this._standAloneMode)
            return true;

        const appConfigSet: AppConfigurationSet = {
            boundedContextName: this._boundedContextName,
            applicationName: this._applicationName,
            applicationVersion: this._applicationVersion,
            ...this._appConfigs.ToJsonObj()
        }
        return this._configProvider!.boostrapAppConfigs(appConfigSet, ignoreDuplicateError);
    }

}
