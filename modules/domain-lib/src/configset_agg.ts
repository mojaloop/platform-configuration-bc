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
import {IAppConfigSetRepository, IGlobalConfigSetRepository} from "./infrastructure_interfaces";
import {
    ConfigItemTypes, AppConfigurationSet, GlobalConfigurationSet,
    ConfigFeatureFlag, ConfigParameter, ConfigSecret
} from "@mojaloop/platform-configuration-bc-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {
    CannotCreateOverridePreviousVersionConfigSetError,
    CannotCreateDuplicateConfigSetError,
    AppConfigurationSetNotFoundError,
    CouldNotStoreConfigSetError,
    ParameterNotFoundError,
    InvalidAppConfigurationSetError,
    OnlyLatestSchemaVersionCanBeChangedError,
    GlobalConfigurationSetNotFoundError,
    InvalidGlobalConfigurationSetError,
    OnlyLatestIterationCanBeChangedError
} from "./errors";
import {AppConfigSetChangeValuesCmdPayload, GlobalConfigSetChangeValuesCmdPayload} from "./commands";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";

enum AuditActions{
    GlobalConfigSet_SchemaVersionCreated = "GlobalConfigSet_SchemaVersionCreated",
    GlobalConfigSet_ValuesChanged = "GlobalConfigSet_ValuesChanged",
    AppConfigSet_SchemaVersionCreated = "AppConfigSet_SchemaVersionCreated",
    AppConfigSet_ValuesChanged = "AppConfigSet_ValuesChanged"
}

export class ConfigSetAggregate {
    private readonly _logger: ILogger;
    private readonly _appConfigSetRepo:IAppConfigSetRepository;
    private readonly _globalConfigSetRepo:IGlobalConfigSetRepository
    private readonly _auditClient:IAuditClient;

    constructor(appConfigSetRepo:IAppConfigSetRepository, globalConfigSetRepo:IGlobalConfigSetRepository, logger: ILogger, auditClient:IAuditClient) {
        this._appConfigSetRepo = appConfigSetRepo;
        this._globalConfigSetRepo = globalConfigSetRepo;
        this._logger = logger;
        this._auditClient = auditClient;
    }

    private async _notifyNewSchema_globalConfigs(globalConfigSet:GlobalConfigurationSet){
        // TODO notify
    }

    private async _notifyNewSchema_appConfigs(appConfigSet:AppConfigurationSet){
        // TODO notify
    }

    private async _notifyNewValues_globalConfigs(globalConfigSet:GlobalConfigurationSet){
        // TODO notify
    }

    private async _notifyNewValues_appConfigs(appConfigSet:AppConfigurationSet){
        // TODO notify
    }

    private _applyCurrentOrDefaultParamValues(targetParams:ConfigParameter[], sourceParams:ConfigParameter[] | null) {
        targetParams.forEach(targetParam => {
            if (sourceParams && sourceParams.length > 0) {
                const sourceParam = sourceParams.find(item => item.name.toUpperCase()===targetParam.name.toUpperCase());
                if (sourceParam && sourceParam.currentValue!=undefined) {
                    targetParam.currentValue = sourceParam.currentValue;
                } else {
                    targetParam.currentValue = targetParam.defaultValue;
                }
            } else {
                targetParam.currentValue = targetParam.defaultValue;
            }
        });
    }

    private _applyCurrentOrDefaultFeatureFlagValues(targetFlags:ConfigFeatureFlag[], sourceFlags:ConfigFeatureFlag[] | null) {
        targetFlags.forEach(targetFeatureFlag => {
            if (sourceFlags && sourceFlags.length > 0) {
                const sourceFeatureFlag = sourceFlags.find(item => item.name.toUpperCase()===targetFeatureFlag.name.toUpperCase());
                if (sourceFeatureFlag && sourceFeatureFlag.currentValue!=undefined) {
                    targetFeatureFlag.currentValue = sourceFeatureFlag.currentValue;
                } else {
                    targetFeatureFlag.currentValue = targetFeatureFlag.defaultValue;
                }
            } else {
                targetFeatureFlag.currentValue = targetFeatureFlag.defaultValue;
            }
        });
    }

    private _applyCurrentOrDefaultSecretValues(targetSecrets:ConfigSecret[], sourceSecrets:ConfigSecret[] | null){
        targetSecrets.forEach(targetSecret => {
            if(sourceSecrets && sourceSecrets.length > 0){
                const sourceSecret = sourceSecrets.find(item => item.name.toUpperCase() === targetSecret.name.toUpperCase());
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

    /**************************************
     * App config set code
     ************************************/

    private _validateAppConfigSet(appConfigSet:AppConfigurationSet):boolean{
        if(!appConfigSet.environmentName
                || !appConfigSet.applicationName
                || !appConfigSet.boundedContextName
                || !appConfigSet.applicationVersion) {
            return false;
        }

        if(!appConfigSet.parameters || !appConfigSet.featureFlags || !appConfigSet.secrets){
            return false;
        }

        if(!Array.isArray(appConfigSet.parameters)
            || !Array.isArray(appConfigSet.featureFlags)
            || !Array.isArray(appConfigSet.secrets)){
            return false;
        }

        if(!appConfigSet.applicationVersion || typeof(appConfigSet.applicationVersion) !== "string"){
            return false;
        }
        const parsed = semver.coerce(appConfigSet.applicationVersion);
        if(!parsed || parsed.raw != appConfigSet.applicationVersion) {
            // the 2nd check assures that formats like "v1.0.1" which are considered valid by semver are rejected, we want strict semver
            return false;
        }

        return true;
    }

    async getAllAppConfigSets(envName:string):Promise<AppConfigurationSet[]>{
        const allVersions: AppConfigurationSet [] = await this._appConfigSetRepo.fetchAllAppConfigSets(envName);
        return allVersions;
    }

    async getLatestAppConfigSet(envName:string, bcName: string, appName: string):Promise<AppConfigurationSet | null>{
        const latestVersion: AppConfigurationSet | null = await this._appConfigSetRepo.fetchLatestAppConfigSet(envName, bcName, appName);
        return latestVersion;
    }

    async getAppConfigSetVersion(envName:string, bcName: string, appName: string, version:string):Promise<AppConfigurationSet | null>{
        const specificVersion: AppConfigurationSet | null = await this._appConfigSetRepo.fetchAppConfigSetVersion(envName, bcName, appName, version);

        return specificVersion;
    }

    async processCreateAppConfigSetCmd(appConfigSet:AppConfigurationSet):Promise<void>{
        // TODO validate the configSet
        if(!this._validateAppConfigSet(appConfigSet)){
            this._logger.warn(`invalid app configuration set for BC: ${appConfigSet?.boundedContextName}, APP: ${appConfigSet?.applicationName}appVersion: ${appConfigSet.applicationVersion} schemaVersion: ${appConfigSet.schemaVersion} and iterationNumber: ${appConfigSet?.iterationNumber}, ERROR `);
            throw new InvalidAppConfigurationSetError();
        }

        const latestVersion: AppConfigurationSet | null = await this._appConfigSetRepo.fetchLatestAppConfigSet(appConfigSet.environmentName, appConfigSet.boundedContextName, appConfigSet.applicationName);

        if(latestVersion) {
            if (semver.compare(latestVersion.applicationVersion, appConfigSet.applicationVersion)==0) {
                this._logger.warn(`received duplicate app configuration set for BC: ${appConfigSet.boundedContextName}, APP: ${appConfigSet.applicationName}appVersion: ${appConfigSet.applicationVersion} schemaVersion: ${appConfigSet.schemaVersion} and iterationNumber: ${appConfigSet.iterationNumber}, IGNORING `);
                throw new CannotCreateDuplicateConfigSetError();
            } else if (semver.compare(latestVersion.applicationVersion, appConfigSet.applicationVersion)==1) {
                this._logger.error(`received app configuration set with lower version than latest for BC: ${appConfigSet.boundedContextName}, APP: ${appConfigSet.applicationName}appVersion: ${appConfigSet.applicationVersion} schemaVersion: ${appConfigSet.schemaVersion} and iterationNumber: ${appConfigSet.iterationNumber}, IGNORING with error`);
                throw new CannotCreateOverridePreviousVersionConfigSetError();
            }
        }

        //apply default values - if creating a new version, the current values should be copied from the old version
        this._applyCurrentOrDefaultParamValues(appConfigSet.parameters, latestVersion ? latestVersion.parameters : null);
        this._applyCurrentOrDefaultFeatureFlagValues(appConfigSet.featureFlags, latestVersion ? latestVersion.featureFlags : null);
        this._applyCurrentOrDefaultSecretValues(appConfigSet.secrets, latestVersion ? latestVersion.secrets : null);

        // new configsets get 0 iterationNumber, newer versions of existing ones continue from the previous
        appConfigSet.iterationNumber = !latestVersion ? 0 : latestVersion.iterationNumber;

        this._logger.info(`received app configuration set for BC: ${appConfigSet.boundedContextName}, APP: ${appConfigSet.applicationName} appVersion: ${appConfigSet.applicationVersion} schemaVersion: ${appConfigSet.schemaVersion} and iterationNumber: ${appConfigSet.iterationNumber}`);
        const stored = await this._appConfigSetRepo.storeAppConfigSet(appConfigSet);
        if(!stored){
            throw new CouldNotStoreConfigSetError();
        }

        // TODO: add audit security context
        // const secCtx: SecurityContext = {
        //     userId: "userid",
        //     appId: null,
        //     role: "role"
        // }
        await this._auditClient.audit(AuditActions.AppConfigSet_SchemaVersionCreated, true);

        await this._notifyNewSchema_appConfigs(appConfigSet);
    }

    async processChangeAppConfigSetValuesCmd(cmdPayload: AppConfigSetChangeValuesCmdPayload):Promise<void> {
        let appConfigSet:AppConfigurationSet | null;
        appConfigSet = await this.getLatestAppConfigSet(cmdPayload.environmentName, cmdPayload.boundedContextName, cmdPayload.applicationName);

        if(!appConfigSet){
            return Promise.reject(new AppConfigurationSetNotFoundError());
        }

        if (cmdPayload.schemaVersion !== appConfigSet.schemaVersion){
            return Promise.reject(new OnlyLatestSchemaVersionCanBeChangedError());
        }

        if (cmdPayload.iteration !== appConfigSet.iterationNumber){
            return Promise.reject(new OnlyLatestIterationCanBeChangedError());
        }

        // TODO return multiple errors instead of just one

        cmdPayload.newValues.forEach((value) => {
            if(value.type.toUpperCase() === ConfigItemTypes.PARAMETER){
                const param = appConfigSet!.parameters.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!param){
                    throw new ParameterNotFoundError();
                }
                param.currentValue = value.value;
            }else if(value.type.toUpperCase() === ConfigItemTypes.FEATUREFLAG){
                const featureFlag = appConfigSet!.featureFlags.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!featureFlag){
                    throw new ParameterNotFoundError();
                }
                featureFlag.currentValue = value.value as boolean;
            }else if(value.type.toUpperCase() === ConfigItemTypes.SECRET){
                const secret = appConfigSet!.secrets.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!secret){
                    throw new ParameterNotFoundError();
                }
                secret.currentValue = value.value.toString();
            }else {
                throw new ParameterNotFoundError();
            }
            return;
        });

        appConfigSet.iterationNumber++;
        const stored = await this._appConfigSetRepo.storeAppConfigSet(appConfigSet);
        if(!stored){
            throw new CouldNotStoreConfigSetError();
        }

        // TODO: add audit security context
        // const secCtx: SecurityContext = {
        //     userId: "userid",
        //     appId: null,
        //     role: "role"
        // }
        await this._auditClient.audit(AuditActions.AppConfigSet_ValuesChanged, true);

        await this._notifyNewValues_appConfigs(appConfigSet);
    }

    /**************************************
     * Global config set code
     ************************************/

    private _validateGlobalConfigSet(globalConfigSet:GlobalConfigurationSet):boolean{
        if(!globalConfigSet.environmentName || !globalConfigSet.schemaVersion) {
            return false;
        }

        if(!globalConfigSet.parameters || !globalConfigSet.featureFlags || !globalConfigSet.secrets){
            return false;
        }

        if(!Array.isArray(globalConfigSet.parameters)
                || !Array.isArray(globalConfigSet.featureFlags)
                || !Array.isArray(globalConfigSet.secrets)){
            return false;
        }

        if(!globalConfigSet.schemaVersion || typeof(globalConfigSet.schemaVersion) !== "string"){
            return false;
        }
        const parsed = semver.coerce(globalConfigSet.schemaVersion);
        if(!parsed || parsed.raw != globalConfigSet.schemaVersion) {
            // the 2nd check assures that formats like "v1.0.1" which are considered valid by semver are rejected, we want strict semver
            return false;
        }

        return true;
    }

    async getAllGlobalConfigSets(envName:string): Promise<GlobalConfigurationSet[]>{
        const allVersions: GlobalConfigurationSet [] = await this._globalConfigSetRepo.fetchGlobalAppConfigSets(envName);
        return allVersions;
    }

    async getGlobalConfigSetVersion(envName:string, version:string): Promise<GlobalConfigurationSet | null>{
        const latestVersion: GlobalConfigurationSet | null = await this._globalConfigSetRepo.fetchGlobalConfigSetVersion(envName, version);
        return latestVersion;
    }

    async getLatestGlobalConfigSet(envName:string): Promise<GlobalConfigurationSet | null>{
        const latestVersion: GlobalConfigurationSet | null = await this._globalConfigSetRepo.fetchLatestGlobalConfigSet(envName);
        return latestVersion;
    }

    async processCreateGlobalConfigSetCmd(globalConfigSet:GlobalConfigurationSet):Promise<void>{
        // TODO validate the configSet
        if(!this._validateGlobalConfigSet(globalConfigSet)){
            this._logger.warn(`invalid global configuration set for env: ${globalConfigSet?.environmentName} schemaVersion: ${globalConfigSet?.schemaVersion} and iterationNumber: ${globalConfigSet?.iterationNumber}, ERROR `);
            throw new InvalidGlobalConfigurationSetError();
        }

        const latestVersion: GlobalConfigurationSet | null = await this._globalConfigSetRepo.fetchLatestGlobalConfigSet(globalConfigSet.environmentName);

        if(latestVersion) {
            if (semver.compare(latestVersion.schemaVersion, globalConfigSet.schemaVersion)==0) {
                this._logger.warn(`received duplicate global configuration set for for env: ${globalConfigSet?.environmentName} schemaVersion: ${globalConfigSet?.schemaVersion} and iterationNumber: ${globalConfigSet?.iterationNumber}, IGNORING `);
                throw new CannotCreateDuplicateConfigSetError();
            } else if (semver.compare(latestVersion.schemaVersion, globalConfigSet.schemaVersion)==1) {
                this._logger.error(`received global configuration set with lower version than latest for for env: ${globalConfigSet?.environmentName} schemaVersion: ${globalConfigSet?.schemaVersion} and iterationNumber: ${globalConfigSet?.iterationNumber}, IGNORING with error`);
                throw new CannotCreateOverridePreviousVersionConfigSetError();
            }
        }

        //apply default values - if creating a new version, the current values should be copied from the old version
        this._applyCurrentOrDefaultParamValues(globalConfigSet.parameters, latestVersion ? latestVersion.parameters : null);
        this._applyCurrentOrDefaultFeatureFlagValues(globalConfigSet.featureFlags, latestVersion ? latestVersion.featureFlags : null);
        this._applyCurrentOrDefaultSecretValues(globalConfigSet.secrets, latestVersion ? latestVersion.secrets : null);


        // new configsets get 0 iterationNumber, newer versions of existing ones continue from the previous
        globalConfigSet.iterationNumber = !latestVersion ? 0 : latestVersion.iterationNumber;

        this._logger.info(`received configuration set for for env: ${globalConfigSet?.environmentName} schemaVersion: ${globalConfigSet?.schemaVersion} and iterationNumber: ${globalConfigSet?.iterationNumber}`);
        const stored = await this._globalConfigSetRepo.storeGlobalConfigSet(globalConfigSet);
        if(!stored){
            throw new CouldNotStoreConfigSetError();
        }

        // TODO: add audit security context
        // const secCtx: SecurityContext = {
        //     userId: "userid",
        //     appId: null,
        //     role: "role"
        // }
        await this._auditClient.audit(AuditActions.GlobalConfigSet_SchemaVersionCreated, true);

        await this._notifyNewSchema_globalConfigs(globalConfigSet);
    }

    async processChangeGlobalConfigSetValuesCmd(cmdPayload: GlobalConfigSetChangeValuesCmdPayload):Promise<void> {
        let globalConfigSet:GlobalConfigurationSet | null;
        globalConfigSet = await this.getLatestGlobalConfigSet(cmdPayload.environmentName);

        if(!globalConfigSet){
            return Promise.reject(new GlobalConfigurationSetNotFoundError());
        }

        if (cmdPayload.schemaVersion !== globalConfigSet.schemaVersion){
            return Promise.reject(new OnlyLatestSchemaVersionCanBeChangedError());
        }

        if (cmdPayload.iteration !== globalConfigSet.iterationNumber){
            return Promise.reject(new OnlyLatestIterationCanBeChangedError());
        }

        // TODO return multiple errors instead of just one

        cmdPayload.newValues.forEach((value) => {
            if(value.type.toUpperCase() === ConfigItemTypes.PARAMETER){
                const param = globalConfigSet!.parameters.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!param){
                    throw new ParameterNotFoundError();
                }
                param.currentValue = value.value;
            }else if(value.type.toUpperCase() === ConfigItemTypes.FEATUREFLAG){
                const featureFlag = globalConfigSet!.featureFlags.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!featureFlag){
                    throw new ParameterNotFoundError();
                }
                featureFlag.currentValue = value.value as boolean;
            }else if(value.type.toUpperCase() === ConfigItemTypes.SECRET){
                const secret = globalConfigSet!.secrets.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!secret){
                    throw new ParameterNotFoundError();
                }
                secret.currentValue = value.value.toString();
            }else {
                throw new ParameterNotFoundError();
            }
            return;
        });

        globalConfigSet.iterationNumber++;
        const stored = await this._globalConfigSetRepo.storeGlobalConfigSet(globalConfigSet);
        if(!stored){
            throw new CouldNotStoreConfigSetError();
        }

        // TODO: add audit security context
        // const secCtx: SecurityContext = {
        //     userId: "userid",
        //     appId: null,
        //     role: "role"
        // }
        await this._auditClient.audit(AuditActions.GlobalConfigSet_ValuesChanged, true);

        await this._notifyNewValues_globalConfigs(globalConfigSet);
    }
}
