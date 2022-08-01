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
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {
    CannotCreateOverridePreviousVersionConfigSetError,
    CannotCreateDuplicateConfigSetError,
    ConfigurationSetNotFoundError,
    CouldNotStoreConfigSetError,
    ParameterNotFoundError, InvalidConfigurationSetError
} from "./errors";
import {ConfigSetChangeValuesCmdPayload} from "./commands";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";




export class ConfigSetAggregate {
    private _logger: ILogger;
    private _repo:IConfigSetRepository;
    private _auditClient:IAuditClient;

    constructor(repo:IConfigSetRepository, logger: ILogger, auditClient:IAuditClient) {
        this._repo = repo;
        this._logger = logger;
        this._auditClient = auditClient;
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

    async getAllConfigSets():Promise<ConfigurationSet[]>{
        const allVersions: ConfigurationSet [] = await this._repo.fetchAll();
        return allVersions;
    }

    async getLatestVersion(envName:string, bcName: string, appName: string):Promise<ConfigurationSet | null>{
        const latestVersion: ConfigurationSet | null = await this._repo.fetchLatest(envName, bcName, appName);
        return latestVersion;
    }

    async getSpecificVersion(envName:string, bcName: string, appName: string, version:string):Promise<ConfigurationSet | null>{
        const specificVersion: ConfigurationSet | null = await this._repo.fetchVersion(envName, bcName, appName, version);

        return specificVersion;
    }

    private _applyCurrentOrDefaulValues(targetConfigSet:ConfigurationSet, sourceConfigSet:ConfigurationSet | null){
        //if(!sourceConfigSet) sourceConfigSet = targetConfigSet;

        targetConfigSet.parameters.forEach(targetParam => {
            if(sourceConfigSet){
                const sourceParam = sourceConfigSet.parameters.find(item => item.name.toUpperCase() === targetParam.name.toUpperCase());
                if(sourceParam && sourceParam.currentValue != undefined){
                    targetParam.currentValue = sourceParam.currentValue;
                }else{
                    targetParam.currentValue = targetParam.defaultValue;
                }
            }else{
                targetParam.currentValue = targetParam.defaultValue;
            }
        });

        targetConfigSet.featureFlags.forEach(targetFeatureFlag => {
            if(sourceConfigSet){
                const sourceFeatureFlag = sourceConfigSet.featureFlags.find(item => item.name.toUpperCase() === targetFeatureFlag.name.toUpperCase());
                if(sourceFeatureFlag && sourceFeatureFlag.currentValue != undefined){
                    targetFeatureFlag.currentValue = sourceFeatureFlag.currentValue;
                }else{
                    targetFeatureFlag.currentValue = targetFeatureFlag.defaultValue;
                }
            }else{
                targetFeatureFlag.currentValue = targetFeatureFlag.defaultValue;
            }
        });

        targetConfigSet.secrets.forEach(targetSecret => {
            if(sourceConfigSet){
                const sourceSecret = sourceConfigSet.secrets.find(item => item.name.toUpperCase() === targetSecret.name.toUpperCase());
                if(sourceSecret && sourceSecret.currentValue != undefined){
                    targetSecret.currentValue = sourceSecret.currentValue;
                }else{
                    // secrets don't have a mandatory default value
                    if(targetSecret.defaultValue) targetSecret.currentValue = targetSecret.defaultValue;
                }
            }else{
                // secrets don't have a mandatory default value
                if(targetSecret.defaultValue) targetSecret.currentValue = targetSecret.defaultValue;
            }
        });
    }


    async processCreateConfigSetCmd(configSet:ConfigurationSet):Promise<void>{
        // TODO validate the configSet
        if(!this._validateConfigSet(configSet)){
            this._logger.warn(`invalid configuration set for BC: ${configSet?.boundedContextName}, APP: ${configSet?.applicationName}, version: ${configSet?.applicationVersion} and iterationNumber: ${configSet?.iterationNumber}, ERROR `);
            throw new InvalidConfigurationSetError();
        }

        const latestVersion: ConfigurationSet | null = await this._repo.fetchLatest(configSet.environmentName, configSet.boundedContextName, configSet.applicationName);

        if(latestVersion) {
            if (semver.compare(latestVersion.applicationVersion, configSet.applicationVersion)==0) {
                this._logger.warn(`received duplicate configuration set for BC: ${configSet.boundedContextName}, APP: ${configSet.applicationName}, version: ${configSet.applicationVersion} and iterationNumber: ${configSet.iterationNumber}, IGNORING `);
                throw new CannotCreateDuplicateConfigSetError();
            } else if (semver.compare(latestVersion.applicationVersion, configSet.applicationVersion)==1) {
                this._logger.error(`received configuration set with lower version than latest for BC: ${configSet.boundedContextName}, APP: ${configSet.applicationName}, version: ${configSet.applicationVersion} and iterationNumber: ${configSet.iterationNumber}, IGNORING with error`);
                throw new CannotCreateOverridePreviousVersionConfigSetError();
            }
        }

        //apply default values - if creating a new version, the current values should be copied from the old version
        this._applyCurrentOrDefaulValues(configSet, latestVersion);

        // new configsets get 0 iterationNumber, newer versions of existing ones continue from the previous
        configSet.iterationNumber = !latestVersion ? 0 : latestVersion.iterationNumber;

        this._logger.info(`received configuration set for BC: ${configSet.boundedContextName}, APP: ${configSet.applicationName}, version: ${configSet.applicationVersion} and iterationNumber: ${configSet.iterationNumber}`);
        const stored = await this._repo.store(configSet);
        if(!stored){
            throw new CouldNotStoreConfigSetError();
        }

        // TODO: add audit security context
        // const secCtx: SecurityContext = {
        //     userId: "userid",
        //     appId: null,
        //     role: "role"
        // }
        await this._auditClient.audit("ConfigSetCreated", true);

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
                    throw new ParameterNotFoundError();
                }
                param.currentValue = value.value;
            }else if(value.type.toUpperCase() === ConfigItemTypes.FEATUREFLAG){
                const featureFlag = configSet!.featureFlags.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!featureFlag){
                    throw new ParameterNotFoundError();
                }
                featureFlag.currentValue = value.value;
            }else if(value.type.toUpperCase() === ConfigItemTypes.SECRET){
                const secret = configSet!.secrets.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!secret){
                    throw new ParameterNotFoundError();
                }
                secret.currentValue = value.value;
            }else {
                throw new ParameterNotFoundError();
            }
            return;
        });


        configSet.iterationNumber++;
        const stored = await this._repo.store(configSet);
        if(!stored){
            throw new CouldNotStoreConfigSetError();
        }

        // TODO: add audit security context
        // const secCtx: SecurityContext = {
        //     userId: "userid",
        //     appId: null,
        //     role: "role"
        // }
        await this._auditClient.audit("ConfigSetValueChanged", true);

        await this._notifyConfigSetChange(configSet);
    }

}
