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

'use strict'

import {IConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {IConfigProvider} from "./iconfig_provider";
import axios, { AxiosResponse, AxiosInstance } from "axios";

export class DefaultConfigProvider implements IConfigProvider {
    private _changerHandler:()=>Promise<void>;
    private _client:AxiosInstance;

    constructor(configSvcBaseUrl:string) {
        axios.defaults.baseURL = "http://localhost:3000";
        this._client = axios.create({
            baseURL: configSvcBaseUrl,
            timeout: 1000,
            //headers: {'X-Custom-Header': 'foobar'} TODO config svc authentication
        })
    }

    async boostrap(configSetDto:IConfigurationSet): Promise<boolean>{
        const resp: AxiosResponse<any> = await this._client.post("/configsets", configSetDto);
        console.log(resp.data);

        return true;
    }

    async init(): Promise<boolean>{

        return true;
    }

    async fetch(bcName:string, appName:string, appVersion:number): Promise<IConfigurationSet | null>{
        let configSetData: IConfigurationSet;
        try {
            const resp = await this._client.get(`/configsets/${bcName}/${appName}/${appVersion}`);
            if(resp.status !== 200) {
                return null;
            }
            configSetData = resp.data;

        } catch (error) {
            console.error(error);
            return null;
        }

        if(configSetData.id.boundedContext.toUpperCase() !== bcName.toUpperCase()
                || configSetData.id.application.toUpperCase() !== appName.toUpperCase()
                || configSetData.id.versionNumber != appVersion
                || configSetData.id.patchNumber < 0){
            console.warn("invalid configSet version received");
            return null;
        }

        return configSetData;
    }


    // this will be called by the IConfigProvider implementation when changes are detected
    setConfigChangeHandler(fn:()=>Promise<void>):void{
        this._changerHandler = fn;
    }
}
