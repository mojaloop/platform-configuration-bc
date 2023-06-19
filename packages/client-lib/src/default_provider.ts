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
    GLOBALCONFIGSET_URL_RESOURCE_NAME,
    BCCONFIGSET_URL_RESOURCE_NAME,
    BoundedContextConfigurationSet,
    GlobalConfigurationSet
} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {IConfigProvider} from "./iconfig_provider";
import axios, {AxiosError, AxiosInstance, AxiosResponse} from "axios";
import process from "process";
import {
    DomainEventMsg,
    IMessage,
    IMessageConsumer,
    MessageTypes
} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {PlatformConfigurationBCTopics} from "@mojaloop/platform-shared-lib-public-messages-lib";

const PLATFORM_CONFIG_BASE_SVC_URL_ENV_VAR_NAME = "PLATFORM_CONFIG_BASE_SVC_URL";

export class DefaultConfigProvider implements IConfigProvider {
    private _changerHandler:(eventMsg:DomainEventMsg)=>Promise<void>;
    private _client:AxiosInstance;
    private _messageConsumer:IMessageConsumer|null;
    private _initialised = false;

    constructor(configSvcBaseUrl:string|null = null, messageConsumer:IMessageConsumer|null = null) {
        this._messageConsumer = messageConsumer;

        if(!configSvcBaseUrl){
            if(process.env[PLATFORM_CONFIG_BASE_SVC_URL_ENV_VAR_NAME] === undefined){
                throw new Error("DefaultConfigProvider cannot continue, a configSvcBaseUrl was not provided in the constructor nor via env var");
            }
            const envVal = process.env[PLATFORM_CONFIG_BASE_SVC_URL_ENV_VAR_NAME];

            try{
                const url = new URL(envVal || "");
                configSvcBaseUrl = url.toString();
            }catch(err){
                throw new Error("DefaultConfigProvider cannot continue, invalid configSvcBaseUrl provided via env var");
            }
        }

        axios.defaults.baseURL = configSvcBaseUrl;
        this._client = axios.create({
            baseURL: configSvcBaseUrl,
            timeout: 1000,
            //headers: {'X-Custom-Header': 'foobar'} TODO config svc authentication
        });

    }

    private async _changeEventHandler(message:IMessage):Promise<void>{
        if(message.msgType !== MessageTypes.DOMAIN_EVENT) return;

        await this._changerHandler(message as DomainEventMsg);
    }

    async boostrapBoundedContextConfigs(configSetDto:BoundedContextConfigurationSet, ignoreDuplicateError = false): Promise<boolean>{
        this._checkInitialised();

        //const resp: AxiosResponse<any> =
        await this._client.post(`/${BCCONFIGSET_URL_RESOURCE_NAME}/bootstrap`, configSetDto).then((resp:AxiosResponse)=>{
            console.log(resp.data);
            return true;
        }).catch((err:AxiosError) => {
            if(err.response && err.response.status === 409 && ignoreDuplicateError === true){
                return true;
            }
            console.log(err);
            return false;
        });
        return false; // linter pleaser
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

    private _checkInitialised(){
        if(!this._initialised) throw new Error("DefaultConfigProvider is not initialised, please call init() first");
    }

    async fetchBoundedContextConfigs(envName:string, bcName:string, schemaVersion:string): Promise<BoundedContextConfigurationSet | null>{
        this._checkInitialised();

        let bcConfigSetData: BoundedContextConfigurationSet;
        try {
            const resp = await this._client.get(`/${BCCONFIGSET_URL_RESOURCE_NAME}/${envName}/${bcName}/?version=${schemaVersion}`);
            if(resp.status !== 200) {
                return null;
            }
            bcConfigSetData = resp.data;

        } catch (error) {
            console.error(error);
            return null;
        }

        if(bcConfigSetData.environmentName.toUpperCase() !== envName.toUpperCase()
                || bcConfigSetData.boundedContextName.toUpperCase() !== bcName.toUpperCase()
                || bcConfigSetData.schemaVersion != schemaVersion
                || bcConfigSetData.iterationNumber < 0){
            console.warn("Invalid BoundedContextConfigurationSet version received in DefaultConfigProvider.fetchBoundedContextConfigs(), must match BC name and config schema version");
            return null;
        }

        return bcConfigSetData;
    }

    async fetchGlobalConfigs(envName:string): Promise<GlobalConfigurationSet | null>{
        this._checkInitialised();

        let globalConfigurationSet: GlobalConfigurationSet;
        try {
            const resp = await this._client.get(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}/${envName}?latest`);
            if(resp.status !== 200) {
                return null;
            }

            globalConfigurationSet = resp.data[0] || null;

        } catch (error: any) {
            if(error && error.response && error.response.status === 404){
                return null;
            }

            console.error(error);
            return null;
        }

        if(globalConfigurationSet.environmentName.toUpperCase() !== envName.toUpperCase() || globalConfigurationSet.iterationNumber < 0){
            console.warn("Invalid GlobalConfigurationSet version received in DefaultConfigProvider.fetchGlobalConfigs");
            return null;
        }

        return globalConfigurationSet;
    }

    // this will be called by the IConfigProvider implementation when changes are detected
    setConfigChangeHandler(fn:(eventMsg:DomainEventMsg)=>Promise<void>):void{
        this._changerHandler = fn;
    }
}
