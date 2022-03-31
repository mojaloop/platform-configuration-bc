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

import semver from "semver";
import {IConfigSetRepository} from "./iconfigset_repo";
import {ConfigItemTypes, ConfigParameterTypes, ConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {ILogger} from "@mojaloop/logging-bc-logging-client-lib/dist/index";
import {
    CannotCreateOverridePreviousVersionConfigSetError,
    CannotCreateDuplicateConfigSetError,
    ConfigurationSetNotFoundError,
    CouldNotStoreConfigSetError,
    ParameterNotFoundError, InvalidConfigurationSetError
} from "./errors";
import {ConfigSetChangeValuesCmdPayload} from "./commands";




export class ConfigSetAggregate {
    private _logger: ILogger;
    private _repo:IConfigSetRepository;

    constructor(repo:IConfigSetRepository, logger: ILogger) {
        this._repo = repo;
        this._logger = logger;
    }

    private async _notifyConfigSetChange(configSet:ConfigurationSet){
        // TODO _notifyConfigSetChange
    }

    private _validateConfigSet(configSet:ConfigurationSet):boolean{
        if(!configSet.environmentName
                || !configSet.applicationName
                || !configSet.boundedContextName
                || !configSet.applicationVersion) {
            return false;
        }

        if(!configSet.parameters || !configSet.featureFlags || !configSet.secrets){
            return false;
        }

        if(!Array.isArray(configSet.parameters)
            || !Array.isArray(configSet.featureFlags)
            || !Array.isArray(configSet.secrets)){
            return false;
        }

        if(!configSet.applicationVersion || typeof(configSet.applicationVersion) !== "string"){
            return false;
        }
        const parsed = semver.coerce(configSet.applicationVersion);
        if(!parsed || parsed.raw != configSet.applicationVersion) {
            // the 2nd check assures that formats like "v1.0.1" which are considered valid by semver are rejected, we want strict semver
            return false;
        }

        return true;
    }

    async getLatestVersion(envName:string, bcName: string, appName: string):Promise<ConfigurationSet | null>{
        const latestVersion: ConfigurationSet | null = await this._repo.fetchLatest(envName, bcName, appName);
        return latestVersion;
    }

    async getSpecificVersion(envName:string, bcName: string, appName: string, version:string):Promise<ConfigurationSet | null>{
        const specificVersion: ConfigurationSet | null = await this._repo.fetchVersion(envName, bcName, appName, version);

        return specificVersion;
    }

    async processCreateConfigSetCmd(configSet:ConfigurationSet):Promise<void>{
        // TODO validate the configSet
        if(!this._validateConfigSet(configSet)){
            this._logger.warn(`invalid configuration set for BC: ${configSet?.boundedContextName}, APP: ${configSet?.applicationName}, version: ${configSet?.applicationVersion} and iterationNumber: ${configSet?.iterationNumber}, ERROR `);
            throw new InvalidConfigurationSetError();
        }

        const latestVersion: ConfigurationSet | null = await this._repo.fetchLatest(configSet.environmentName, configSet.boundedContextName, configSet.applicationName);

        if(latestVersion && semver.compare(latestVersion.applicationVersion, configSet.applicationVersion) == 0) {
            this._logger.warn(`received duplicate configuration set for BC: ${configSet.boundedContextName}, APP: ${configSet.applicationName}, version: ${configSet.applicationVersion} and iterationNumber: ${configSet.iterationNumber}, IGNORING `);
            throw new CannotCreateDuplicateConfigSetError();
        }else if(latestVersion && semver.compare(latestVersion.applicationVersion, configSet.applicationVersion)  == 1) {
            this._logger.error(`received configuration set with lower version than latest for BC: ${configSet.boundedContextName}, APP: ${configSet.applicationName}, version: ${configSet.applicationVersion} and iterationNumber: ${configSet.iterationNumber}, IGNORING with error`);
            throw new CannotCreateOverridePreviousVersionConfigSetError();
        }


        //TODO apply default values - if creating a new version, the current values should be copied from the old version
        if(!configSet.iterationNumber) configSet.iterationNumber = 0;

        this._logger.info(`received configuration set for BC: ${configSet.boundedContextName}, APP: ${configSet.applicationName}, version: ${configSet.applicationVersion} and iterationNumber: ${configSet.iterationNumber}`);
        const stored = await this._repo.store(configSet);
        if(!stored){
            throw new CouldNotStoreConfigSetError();
        }

        await this._notifyConfigSetChange(configSet);
    }


    async processChangeValuesCmd(cmdPayload: ConfigSetChangeValuesCmdPayload):Promise<void> {
        let configSet:ConfigurationSet | null;
        if (!cmdPayload.version){
            configSet = await this.getLatestVersion(cmdPayload.environmentName, cmdPayload.boundedContextName, cmdPayload.applicationName);
        }else{
            configSet = await this.getSpecificVersion(cmdPayload.environmentName, cmdPayload.boundedContextName, cmdPayload.applicationName, cmdPayload.version);
        }

        if(!configSet){
            return Promise.reject(new ConfigurationSetNotFoundError());
        }

        // TODO return multiple errors instead of just one

        cmdPayload.newValues.forEach((value) => {
            if(value.type.toUpperCase() === ConfigItemTypes.PARAMETER){
                const param = configSet!.parameters.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!param){
                    return Promise.reject( new ParameterNotFoundError());
                }
                param.currentValue = value.value;
            }else if(value.type.toUpperCase() === ConfigItemTypes.FEATUREFLAG){
                const featureFlag = configSet!.featureFlags.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!featureFlag){
                    return Promise.reject( new ParameterNotFoundError());
                }
                featureFlag.currentValue = value.value;
            }else if(value.type.toUpperCase() === ConfigItemTypes.SECRET){
                const secret = configSet!.secrets.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!secret){
                    return Promise.reject( new ParameterNotFoundError());
                }
                secret.currentValue = value.value;
            }else {
                return Promise.reject( new ParameterNotFoundError());
            }
            return;
        });


        configSet.iterationNumber++;
        const stored = await this._repo.store(configSet);
        if(!stored){
            return Promise.reject(new CouldNotStoreConfigSetError());
        }

        await this._notifyConfigSetChange(configSet);
    }

}
