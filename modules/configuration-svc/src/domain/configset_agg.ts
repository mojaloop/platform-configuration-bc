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


import {IConfigSetRepository} from "./iconfigset_repo";
import {IConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {ILogger} from "@mojaloop/logging-bc-logging-client-lib/dist/index";
import {
    CannotCreateOverridePreviousVersionConfigSetError,
    CannotCreateDuplicateConfigSetError,
    ConfigurationSetNotFoundError,
    CouldNotStoreConfigSetError,
    ParameterNotFoundError, InvalidConfigurationSetError
} from "./errors";

export class ConfigSetAggregate {
    private _logger: ILogger;
    private _repo:IConfigSetRepository;

    constructor(repo:IConfigSetRepository, logger: ILogger) {
        this._repo = repo;
        this._logger = logger;
    }

    private async _notifyConfigSetChange(configSet:IConfigurationSet){
        // TODO _notifyConfigSetChange
    }

    private _validateConfigSet(configSet:IConfigurationSet):boolean{
        if(!configSet.id || !configSet.params || !configSet.featureFlags || !configSet.secrets){
            return false;
        }

        if(!configSet.id.application || !configSet.id.boundedContext ) {
            return false;
        }

        if(configSet.id.versionNumber < 0 ) {
            return false;
        }

        return true;
    }

    async createNewConfigSetVersion(configSet:IConfigurationSet):Promise<void>{
        // TODO validate the configSet
        if(!this._validateConfigSet(configSet)){
            this._logger.warn(`invalid configuration set for BC: ${configSet.id.boundedContext}, APP: ${configSet.id.application}, version: ${configSet.id.versionNumber} and patch: ${configSet.id.patchNumber}, ERROR `);
            return Promise.reject(new InvalidConfigurationSetError());
        }

        const latestVersion: IConfigurationSet | null = await this._repo.fetchLatest(configSet.id.boundedContext, configSet.id.application);

        if(latestVersion && latestVersion.id.versionNumber == configSet.id.versionNumber) {
            this._logger.warn(`received duplicate configuration set for BC: ${configSet.id.boundedContext}, APP: ${configSet.id.application}, version: ${configSet.id.versionNumber} and patch: ${configSet.id.patchNumber}, IGNORING `);
            return Promise.reject(new CannotCreateDuplicateConfigSetError());
        }else if(latestVersion && latestVersion.id.versionNumber > configSet.id.versionNumber) {
            this._logger.error(`received configuration set with lower version than latest for BC: ${configSet.id.boundedContext}, APP: ${configSet.id.application}, version: ${configSet.id.versionNumber} and patch: ${configSet.id.patchNumber}, IGNORING with error`);
            return Promise.reject(new CannotCreateOverridePreviousVersionConfigSetError());
        }


        //TODO apply default values - if creating a new version, the current values should be copied from the old version
        if(!configSet.id.patchNumber) configSet.id.patchNumber = 0;

        this._logger.info(`received configuration set for BC: ${configSet.id.boundedContext}, APP: ${configSet.id.application}, version: ${configSet.id.versionNumber} and patch: ${configSet.id.patchNumber}`);
        const stored = await this._repo.store(configSet);
        if(!stored){
            return Promise.reject(new CouldNotStoreConfigSetError());
        }

        await this._notifyConfigSetChange(configSet);
    }

    async getLatestVersion(bcName: string, appName: string):Promise<IConfigurationSet | null>{
        const latestVersion: IConfigurationSet | null = await this._repo.fetchLatest(bcName, appName);
        return latestVersion;
    }

    async getSpecificVersion(bcName: string, appName: string, version:number):Promise<IConfigurationSet | null>{
        const specificVersion: IConfigurationSet | null = await this._repo.fetchVersion(bcName, appName, version);

        return specificVersion;
    }

    async updateParamValue(bcName: string, appName: string, paramName:string, paramValue:string):Promise<void>{
        // TODO validate paramName and paramValue

        const configSet = await this.getLatestVersion(bcName, appName);
        if(!configSet){
            return Promise.reject(new ConfigurationSetNotFoundError());
        }
        const param = configSet.params.find(value => value.name.toUpperCase() === paramName.toUpperCase());

        if(!param){
            return Promise.reject(new ParameterNotFoundError());
        }
        param.currentValue = paramValue;

        configSet.id.patchNumber++;
        const stored = await this._repo.store(configSet);
        if(!stored){
            return Promise.reject(new CouldNotStoreConfigSetError());
        }

        await this._notifyConfigSetChange(configSet);
    }

    async updateFeatureFlagValue(bcName: string, appName: string,  featureFlagName:string, featureFlagValue:boolean):Promise<void>{

    }

    async updateSecretValue(bcName: string, appName: string,  secretName:string, secretValue:string):Promise<void>{

    }
}
