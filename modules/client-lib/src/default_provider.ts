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

import {AppConfigurationSet, GlobalConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {IConfigProvider} from "./iconfig_provider";
import axios, { AxiosResponse, AxiosInstance, AxiosError } from "axios";
import process from "process";


const PLATFORM_CONFIG_CENTRAL_URL_ENV_VAR_NAME = "PLATFORM_CONFIG_CENTRAL_URL";

const APP_CONFIG_SET_RESOURCENAME = "appConfigSets";
const GLOBAL_CONFIG_SET_RESOURCENAME = "globalConfigSets";

export class DefaultConfigProvider implements IConfigProvider {
    private _changerHandler:()=>Promise<void>;
    private _client:AxiosInstance;
    private _initialised = false;

    constructor(configSvcBaseUrl:string|null = null) {

        if(!configSvcBaseUrl){
            if(process.env[PLATFORM_CONFIG_CENTRAL_URL_ENV_VAR_NAME] === undefined){
                throw new Error("DefaultConfigProvider cannot continue, a configSvcBaseUrl was not provided in the constructor nor via env var")
            }
            const envVal = process.env[PLATFORM_CONFIG_CENTRAL_URL_ENV_VAR_NAME];

            try{
                const url = new URL(envVal || "");
                configSvcBaseUrl = url.toString();
            }catch(err){
                throw new Error("DefaultConfigProvider cannot continue, invalid configSvcBaseUrl provided via env var")
            }
        }

        axios.defaults.baseURL = configSvcBaseUrl;
        this._client = axios.create({
            baseURL: configSvcBaseUrl,
            timeout: 1000,
            //headers: {'X-Custom-Header': 'foobar'} TODO config svc authentication
        })
    }

    async boostrapAppConfigs(configSetDto:AppConfigurationSet, ignoreDuplicateError = false): Promise<boolean>{
        this._checkInitialised();

        //const resp: AxiosResponse<any> =
        await this._client.post(`/${APP_CONFIG_SET_RESOURCENAME}/bootstrap`, configSetDto).then((resp:AxiosResponse)=>{
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
        this._initialised = true;
        return true;
    }

    private _checkInitialised(){
        if(!this._initialised) throw new Error("DefaultConfigProvider is not initialised, please call init() first");
    }

    async fetchAppConfigs(envName:string, bcName:string, appName:string, schemaVersion:string): Promise<AppConfigurationSet | null>{
        this._checkInitialised();

        let appConfigSetData: AppConfigurationSet;
        try {
            const resp = await this._client.get(`/${APP_CONFIG_SET_RESOURCENAME}/${envName}/${bcName}/${appName}?version=${schemaVersion}`);
            if(resp.status !== 200) {
                return null;
            }
            appConfigSetData = resp.data;

        } catch (error) {
            console.error(error);
            return null;
        }

        if(appConfigSetData.environmentName.toUpperCase() !== envName.toUpperCase()
                || appConfigSetData.boundedContextName.toUpperCase() !== bcName.toUpperCase()
                || appConfigSetData.applicationName.toUpperCase() !== appName.toUpperCase()
                || appConfigSetData.schemaVersion != schemaVersion
                || appConfigSetData.iterationNumber < 0){
            console.warn("Invalid AppConfigurationSet version received in DefaultConfigProvider.fetchAppConfigs(), must match bc name, app name and config schema version");
            return null;
        }

        return appConfigSetData;
    }

    async fetchGlobalConfigs(envName:string): Promise<GlobalConfigurationSet | null>{
        this._checkInitialised();

        let globalConfigurationSet: GlobalConfigurationSet;
        try {
            const resp = await this._client.get(`/${GLOBAL_CONFIG_SET_RESOURCENAME}/${envName}?latest`);
            if(resp.status !== 200) {
                return null;
            }

            globalConfigurationSet = resp.data[0] || null;

        } catch (error) {
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
    setConfigChangeHandler(fn:()=>Promise<void>):void{
        this._changerHandler = fn;
    }
}
