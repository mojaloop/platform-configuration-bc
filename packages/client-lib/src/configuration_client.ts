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

import process from "process";
import {IConfigProvider} from "./iconfig_provider";
import {BCConfigurationSetWrapper, GlobalConfigurationSetWrapper} from "./configurationset_wrappers";

import {
    BoundedContextConfigurationSet,
    GlobalConfigurationSet, IBoundedContextConfigurationClient,
    IConfigurationClient, IGlobalConfigurationClient,
} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {DomainEventMsg} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
    PlatformConfigBoundedContextConfigsChangedEvt,
    PlatformConfigGlobalConfigsChangedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";

// name of the env var that if present disables remote fetch (uses only env vars or defaults)
const STANDALONE_ENV_VAR_NAME = "PLATFORM_CONFIG_STANDALONE";
const ENV_VAR_BC_OVERRIDE_PREFIX = "ML_BC_";
const ENV_VAR_GLOBAL_OVERRIDE_PREFIX = "ML_GLOBAL_";

export class ConfigurationClient implements IConfigurationClient{
    private readonly _configProvider:IConfigProvider | null;
    private readonly _boundedContextName: string;
    private readonly _applicationName: string;
    private readonly _applicationVersion: string;
    private readonly _standAloneMode: boolean = false;
    private readonly _bcConfigs:BCConfigurationSetWrapper;
    private readonly _globalConfigs:GlobalConfigurationSetWrapper;
    private _changeHandlerFn: (type:"BC"|"GLOBAL")=>void;

    constructor(boundedContext: string, application: string, appVersion: string, appConfigSchemaVersion:string, configProvider:IConfigProvider | null = null) {
        this._configProvider = configProvider;

        // TODO: validate params

        this._boundedContextName = boundedContext;
        this._applicationName = application;
        this._applicationVersion = appVersion;

        this._standAloneMode = configProvider === null || process.env[STANDALONE_ENV_VAR_NAME] != undefined;

        this._bcConfigs = new BCConfigurationSetWrapper(appConfigSchemaVersion);
        this._globalConfigs = new GlobalConfigurationSetWrapper();

        if(!this._standAloneMode && this._configProvider){
            this._configProvider.setConfigChangeHandler(this._changeMessageEvtHandler.bind(this));
        }
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

    get bcConfigs():IBoundedContextConfigurationClient{
        return this._bcConfigs;
    }

    get globalConfigs():IGlobalConfigurationClient{
        return this._globalConfigs;
    }

    private async _changeMessageEvtHandler(eventMsg:DomainEventMsg):Promise<void>{
        // return immediately and use a random wait to avoid having all clients hitting the svc at same time
        const waitMs = Math.floor(Math.random() * (2000 - 250) + 250);
        setTimeout(async ()=>{
            if(eventMsg.msgName === PlatformConfigGlobalConfigsChangedEvt.name){
                const evt = eventMsg as PlatformConfigGlobalConfigsChangedEvt;

                await this._fetchGlobal();
                if(this._changeHandlerFn)
                    this._changeHandlerFn("GLOBAL");
            }else if(eventMsg.msgName === PlatformConfigBoundedContextConfigsChangedEvt.name){
                const evt = eventMsg as PlatformConfigBoundedContextConfigsChangedEvt;
                if(evt.payload.boundedContextName !== this.boundedContextName)
                    return;

                await this._fetchBc();
                if(this._changeHandlerFn)
                    this._changeHandlerFn("BC");
            }
        }, waitMs);
    }

    async init(): Promise<void>{
        if(!this._standAloneMode && this._configProvider){
            await this._configProvider.init();
        }

        this._bcConfigs.ApplyFromEnvVars(ENV_VAR_BC_OVERRIDE_PREFIX);
        this._globalConfigs.ApplyFromEnvVars(ENV_VAR_GLOBAL_OVERRIDE_PREFIX);
    }

    async destroy(): Promise<void>{
        if(this._configProvider){
            await this._configProvider.destroy();
        }
    }

    async fetch(): Promise<void>{
        await this._fetchBc();
        await this._fetchGlobal();
    }

    private async _fetchGlobal(): Promise<void>{
        if(this._standAloneMode)
            return;

        let globalConfigSetDto: GlobalConfigurationSet | null = null;
        try {
            globalConfigSetDto = await this._configProvider!.fetchGlobalConfigs();
        }catch(err:any){
            throw new Error(`Could not fetch GlobalConfigurationSet - ${err?.message}`);
        }

        if(!globalConfigSetDto){
            // no global config found
            return;
        }

        this._globalConfigs.SetFromJsonObj(globalConfigSetDto);

        this._globalConfigs.ApplyFromEnvVars(ENV_VAR_GLOBAL_OVERRIDE_PREFIX); // env vars always take priority
    }

    private async _fetchBc(): Promise<void>{
        if(this._standAloneMode)
            return;

        const bcConfigSetDto:BoundedContextConfigurationSet|null = await this._configProvider!.fetchBoundedContextConfigs(this._boundedContextName, this._bcConfigs.schemaVersion);
        if(!bcConfigSetDto){
            // TODO log
            throw new Error(`Could not fetch BoundedContextConfigurationSet for BC: ${this._boundedContextName} - SCHEMA_VERSION: ${this._bcConfigs.schemaVersion}`);
        }

        if(bcConfigSetDto.schemaVersion !== this._bcConfigs.schemaVersion ||
                bcConfigSetDto.boundedContextName !== this._boundedContextName){
            throw new Error("Received BoundedContextConfiguration doesn't match current configuration (schema version, or BC name)");
        }

        this._bcConfigs.SetFromJsonObj(bcConfigSetDto);

        this._bcConfigs.ApplyFromEnvVars(ENV_VAR_BC_OVERRIDE_PREFIX); // env vars always take priority
    }

    async bootstrap(ignoreDuplicateError = false): Promise<boolean>{
        if(this._standAloneMode)
            return true;

        const bcConfigSet: BoundedContextConfigurationSet = {
            boundedContextName: this._boundedContextName,
            ...this._bcConfigs.ToJsonObj()
        };
        return this._configProvider!.boostrapBoundedContextConfigs(bcConfigSet, ignoreDuplicateError);
    }

    setChangeHandlerFunction(fn: (type:"BC"|"GLOBAL")=>void): void{
        this._changeHandlerFn = fn;
    }
}
