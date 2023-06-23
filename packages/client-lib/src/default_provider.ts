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
import {
    GLOBALCONFIGSET_URL_RESOURCE_NAME,
    BCCONFIGSET_URL_RESOURCE_NAME,
    BoundedContextConfigurationSet,
    GlobalConfigurationSet
} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {IConfigProvider} from "./iconfig_provider";
import {
    DomainEventMsg,
    IMessage,
    IMessageConsumer,
    MessageTypes
} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {PlatformConfigurationBCTopics} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {ForbiddenError, IAuthenticatedHttpRequester, UnauthorizedError} from "@mojaloop/security-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";

const PLATFORM_CONFIG_BASE_SVC_URL_ENV_VAR_NAME = "PLATFORM_CONFIG_BASE_SVC_URL";

export class DefaultConfigProvider implements IConfigProvider {
    private readonly _logger: ILogger;
    private _changerHandler:(eventMsg:DomainEventMsg)=>Promise<void>;
    private readonly _baseUrlHttpService: string;
    private readonly _authRequester: IAuthenticatedHttpRequester;
    private readonly _messageConsumer:IMessageConsumer|null;
    private _initialised = false;

    constructor(
        logger: ILogger,
        authRequester: IAuthenticatedHttpRequester,
        messageConsumer:IMessageConsumer|null = null,
        baseUrlHttpService:string|null = null,
    ) {
        this._logger = logger.createChild(this.constructor.name);
        this._authRequester = authRequester;
        this._messageConsumer = messageConsumer;

        if(baseUrlHttpService){
            this._baseUrlHttpService = baseUrlHttpService;
        }else{
            if(process.env[PLATFORM_CONFIG_BASE_SVC_URL_ENV_VAR_NAME] === undefined){
                throw new Error("DefaultConfigProvider cannot continue, a configSvcBaseUrl was not provided in the constructor nor via env var");
            }
            const envVal = process.env[PLATFORM_CONFIG_BASE_SVC_URL_ENV_VAR_NAME];

            try{
                const url = new URL(envVal || "");
                this._baseUrlHttpService = url.toString();
            }catch(err){
                throw new Error("DefaultConfigProvider cannot continue, invalid configSvcBaseUrl provided via env var");
            }
        }

    }

    private async _changeEventHandler(message:IMessage):Promise<void>{
        if(message.msgType !== MessageTypes.DOMAIN_EVENT) return;

        await this._changerHandler(message as DomainEventMsg);
    }

    private _checkInitialised(){
        if(!this._initialised) throw new Error("DefaultConfigProvider is not initialised, please call init() first");
    }

    async init(): Promise<boolean>{
        if(this._messageConsumer){
            this._messageConsumer.setTopics([PlatformConfigurationBCTopics.DomainEvents]);
            this._messageConsumer.setCallbackFn(this._changeEventHandler.bind(this));
            await this._messageConsumer.connect();
            await this._messageConsumer.startAndWaitForRebalance();
        }

        this._initialised = true;
        return true;
    }

    async destroy(): Promise<void>{
        if(this._messageConsumer){
            await this._messageConsumer.destroy(true);
        }
    }

    async boostrapBoundedContextConfigs(configSetDto:BoundedContextConfigurationSet, ignoreDuplicateError = false): Promise<boolean>{
        this._checkInitialised();

        const url = new URL(`/${BCCONFIGSET_URL_RESOURCE_NAME}/bootstrap`, this._baseUrlHttpService).toString();
        const request = new Request(url, {
            method: "POST",
            body: JSON.stringify(configSetDto),
        });

        try {
            const resp = await this._authRequester.fetch(request);

            if(resp.status === 401){
                throw new UnauthorizedError(`Error boostrapBoundedContextConfigs - UnauthorizedError - ${await resp.text()}`);
            }
            if(resp.status === 403){
                throw new ForbiddenError(`Error boostrapBoundedContextConfigs - Forbidden - ${await resp.text()}`);
            }

            if(resp.status === 200){
                return true;
            }

            if(resp.status === 409 && ignoreDuplicateError === true){
                return true;
            }

            const err = new Error(`Invalid response from boostrapBoundedContextConfigs() - status: ${resp.status}`);
            this._logger.error(err);
            return false;
        }catch(error:unknown){
            this._logger.error(error);
            if(error instanceof Error) throw error;
            return false;
        }
    }




    async fetchBoundedContextConfigs(bcName:string, schemaVersion:string): Promise<BoundedContextConfigurationSet | null>{
        this._checkInitialised();

        const url = new URL(`/${BCCONFIGSET_URL_RESOURCE_NAME}/${bcName}/?version=${schemaVersion}`, this._baseUrlHttpService).toString();

        try {
            const resp = await this._authRequester.fetch(url);

            if(resp.status === 401){
                throw new UnauthorizedError(`Error fetchBoundedContextConfigs - UnauthorizedError - ${await resp.text()}`);
            }
            if(resp.status === 403){
                throw new ForbiddenError(`Error fetchBoundedContextConfigs - Forbidden - ${await resp.text()}`);
            }

            if(resp.status !== 200){
                return null;
            }

            const bcConfigSetData: BoundedContextConfigurationSet = await resp.json();

            if(bcConfigSetData.boundedContextName.toUpperCase() !== bcName.toUpperCase()
                || bcConfigSetData.schemaVersion != schemaVersion
                || bcConfigSetData.iterationNumber < 0){
                this._logger.warn("Invalid BoundedContextConfigurationSet version received in DefaultConfigProvider.fetchBoundedContextConfigs(), must match BC name and config schema version");
                return null;
            }

            return bcConfigSetData;

        } catch (error: unknown) {
            this._logger.error(error);
            if(error instanceof Error) throw error;
            return null;
        }
    }

    async fetchGlobalConfigs(): Promise<GlobalConfigurationSet | null>{
        this._checkInitialised();

        const url = new URL(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}?latest`, this._baseUrlHttpService).toString();

        try {
            const resp = await this._authRequester.fetch(url);

            if(resp.status === 401){
                throw new UnauthorizedError(`Error fetchGlobalConfigs - UnauthorizedError - ${await resp.text()}`);
            }
            if(resp.status === 403){
                throw new ForbiddenError(`Error fetchGlobalConfigs - Forbidden - ${await resp.text()}`);
            }

            if(resp.status !== 200){
                return null;
            }

            const data = await resp.json();
            const globalConfigurationSet: GlobalConfigurationSet = data[0] || null;

            return globalConfigurationSet;

        } catch (error: unknown) {
            this._logger.error(error);
            if(error instanceof Error) throw error;
            return null;
        }
    }

    // this will be called by the IConfigProvider implementation when changes are detected
    setConfigChangeHandler(fn:(eventMsg:DomainEventMsg)=>Promise<void>):void{
        this._changerHandler = fn;
    }
}
