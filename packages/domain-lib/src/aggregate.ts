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
import Ajv from "ajv/dist/jtd";
import semver from "semver";
import {IBoundedContextConfigSetRepository, IGlobalConfigSetRepository} from "./infrastructure_interfaces";
import {
    BoundedContextConfigurationSet,
    ConfigFeatureFlag,
    ConfigItemTypes,
    ConfigParameter,
    ConfigParameterTypes,
    ConfigSecret,
    GlobalConfigurationSet
} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {
    BoundedContextConfigurationSetNotFoundError,
    CannotCreateDuplicateConfigSetError,
    CannotCreateOverridePreviousVersionConfigSetError,
    CouldNotStoreConfigSetError,
    GlobalConfigurationSetNotFoundError,
    InvalidBoundedContextConfigurationSetError,
    InvalidGlobalConfigurationSetError,
    OnlyLatestIterationCanBeChangedError,
    OnlyLatestSchemaVersionCanBeChangedError,
    ParameterNotFoundError
} from "./errors";
import {BoundedContextConfigSetChangeValuesCmdPayload, GlobalConfigSetChangeValuesCmdPayload} from "./commands";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {ForbiddenError, IAuthorizationClient, CallSecurityContext} from "@mojaloop/security-bc-public-types-lib";
import {IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
    PlatformConfigGlobalConfigsChangedEvtPayload,
    PlatformConfigGlobalConfigsChangedEvt,
    PlatformConfigBoundedContextConfigsChangedEvtPayload,
    PlatformConfigBoundedContextConfigsChangedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {PlatformConfigurationPrivileges} from "./privilege_names";

enum AuditActions{
    GlobalConfigSet_SchemaVersionCreated = "GlobalConfigSet_SchemaVersionCreated",
    GlobalConfigSet_ValuesChanged = "GlobalConfigSet_ValuesChanged",
    BoundedContextConfigSet_SchemaVersionCreated = "BoundedContextConfigSet_SchemaVersionCreated",
    BoundedContextConfigSet_ValuesChanged = "BoundedContextConfigSet_ValuesChanged"
}

export class ConfigSetAggregate {
    private readonly _logger: ILogger;
    private readonly _bcConfigSetRepo:IBoundedContextConfigSetRepository;
    private readonly _globalConfigSetRepo:IGlobalConfigSetRepository;
    private readonly _auditClient:IAuditClient;
    private readonly _authorizationClient: IAuthorizationClient;
    private readonly _messageProducer:IMessageProducer;
    private readonly _ajv: Ajv;

    constructor(
        bcConfigSetRepo:IBoundedContextConfigSetRepository,
        globalConfigSetRepo:IGlobalConfigSetRepository,
        auditClient:IAuditClient,
        authorizationClient: IAuthorizationClient,
        messageProducer:IMessageProducer,
        logger: ILogger
    ) {
        this._bcConfigSetRepo = bcConfigSetRepo;
        this._globalConfigSetRepo = globalConfigSetRepo;
        this._logger = logger;
        this._auditClient = auditClient;
        this._authorizationClient = authorizationClient;
        this._messageProducer = messageProducer;

        this._ajv = new Ajv();
    }

    private _enforcePrivilege(secCtx: CallSecurityContext, privilegeId: string): void {
        for (const roleId of secCtx.rolesIds) {
            if (this._authorizationClient.roleHasPrivilege(roleId, privilegeId)) {
                return;
            }
        }
        const error = new ForbiddenError("Caller is missing role with privilegeId: " + privilegeId);
        this._logger.isWarnEnabled() && this._logger.warn(error.message);
        throw error;
    }

    private async _notifyNewSchema_globalConfigs(globalConfigSet:GlobalConfigurationSet){
        return this._notifyNewValues_globalConfigs(globalConfigSet);
    }

    private async _notifyNewSchema_bcConfigs(bcConfigSet:BoundedContextConfigurationSet){
        return this._notifyNewValues_bcConfigs(bcConfigSet);
    }

    private async _notifyNewValues_globalConfigs(globalConfigSet:GlobalConfigurationSet){
        const payload:PlatformConfigGlobalConfigsChangedEvtPayload = {
            schemaVersion: globalConfigSet.schemaVersion,
            iterationNumber: globalConfigSet.iterationNumber
        };
        const evt = new PlatformConfigGlobalConfigsChangedEvt(payload);
        await this._messageProducer.send(evt);
    }

    private async _notifyNewValues_bcConfigs(bcConfigSet:BoundedContextConfigurationSet){
        const payload:PlatformConfigBoundedContextConfigsChangedEvtPayload = {
            schemaVersion: bcConfigSet.schemaVersion,
            iterationNumber: bcConfigSet.iterationNumber,
            boundedContextName: bcConfigSet.boundedContextName
        };
        const evt = new PlatformConfigBoundedContextConfigsChangedEvt(payload);
        await this._messageProducer.send(evt);
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

    private _validateJsonTypeDefinition(param:ConfigParameter, data:any): string | null{
        if(!(param.type===ConfigParameterTypes.LIST || param.type ===ConfigParameterTypes.OBJECT)) return null;

        if(!param.jsonSchema) return "Invalid jsonSchema for parameter of type List or Object";
        let jtd:any = {};
        try{
            jtd = JSON.parse(param.jsonSchema);
        }catch(err){
            this._logger.error(err);
            return "Invalid jsonSchema for parameter of type List or Object";
        }

        // validate the data passed
        if(param.type ===ConfigParameterTypes.OBJECT){
            const valid = this._ajv.validate(jtd, data);
            if(valid) return null;

            return this._ajv.errorsText();
        }

        // check list
        for(const item of data){
            const valid = this._ajv.validate(jtd, item);
            if(!valid)
                return this._ajv.errorsText();
        }

        return null;
    }

    /**************************************
     * BoundedContext config set code
     ************************************/

    private _validateBoundedContextConfigSet(bcConfigSet:BoundedContextConfigurationSet):boolean{
        if(!bcConfigSet.boundedContextName) {
            return false;
        }

        if(!bcConfigSet.parameters || !bcConfigSet.featureFlags || !bcConfigSet.secrets){
            return false;
        }

        if(!Array.isArray(bcConfigSet.parameters)
            || !Array.isArray(bcConfigSet.featureFlags)
            || !Array.isArray(bcConfigSet.secrets)){
            return false;
        }


        // detect differences - 0.2 should be different from the coerced 0.2.0 and invalid input
        const parsed = semver.coerce(bcConfigSet.schemaVersion);
        if(!parsed || parsed.raw != bcConfigSet.schemaVersion) {
            // the 2nd check assures that formats like "v1.0.1" which are considered valid by semver are rejected, we want strict semver
            return false;
        }

        return true;
    }

    private async _getLatestBoundedContextConfigSet(bcName: string):Promise<BoundedContextConfigurationSet | null>{

        try {
            const latestVersion: BoundedContextConfigurationSet | null = await this._bcConfigSetRepo.fetchLatestBoundedContextConfigSet(bcName);
            return latestVersion;
        }catch(err){
            this._logger.error(err);
            return null;
        }

    }

    async getAllBoundedContextConfigSets(secCtx: CallSecurityContext, ):Promise<BoundedContextConfigurationSet[]>{
        try {
            const allVersions: BoundedContextConfigurationSet [] = await this._bcConfigSetRepo.fetchAllBoundedContextConfigSets();
            return allVersions;
        }catch(err){
            this._logger.error(err);
            return [];
        }
    }

    async getLatestBoundedContextConfigSet(secCtx: CallSecurityContext, bcName: string):Promise<BoundedContextConfigurationSet | null>{
        this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.VIEW_BOUNDED_CONTEXT);

        return this._getLatestBoundedContextConfigSet(bcName);
    }

    async getBoundedContextConfigSetVersion(secCtx: CallSecurityContext, bcName: string, version:string):Promise<BoundedContextConfigurationSet | null>{
        this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.VIEW_BOUNDED_CONTEXT);

        try {
            const specificVersion: BoundedContextConfigurationSet | null = await this._bcConfigSetRepo.fetchBoundedContextConfigSetVersion(bcName, version);
            return specificVersion;
        }catch(err){
            this._logger.error(err);
            return null;
        }
    }

    async processCreateBoundedContextConfigSetCmd(secCtx: CallSecurityContext, bcConfigSet:BoundedContextConfigurationSet):Promise<void>{
        this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.BOOSTRAP_BOUNDED_CONTEXT);

        // TODO validate the configSet
        if(!this._validateBoundedContextConfigSet(bcConfigSet)){
            this._logger.warn(`invalid BC configuration set for BC: ${bcConfigSet?.boundedContextName}, schemaVersion: ${bcConfigSet.schemaVersion} and iterationNumber: ${bcConfigSet?.iterationNumber}, ERROR `);
            throw new InvalidBoundedContextConfigurationSetError();
        }

        const latestVersion: BoundedContextConfigurationSet | null = await this._getLatestBoundedContextConfigSet(bcConfigSet.boundedContextName);

        if(latestVersion) {
            if (semver.compare(latestVersion.schemaVersion, bcConfigSet.schemaVersion)==0) {
                this._logger.warn(`received duplicate BC configuration set for BC: ${bcConfigSet.boundedContextName}, schemaVersion: ${bcConfigSet.schemaVersion} and iterationNumber: ${bcConfigSet.iterationNumber}, IGNORING `);
                throw new CannotCreateDuplicateConfigSetError("Duplicate schemaVersion");
            } else if (semver.compare(latestVersion.schemaVersion, bcConfigSet.schemaVersion)==1) {
                this._logger.error(`received BC configuration set with lower version than latest for BC: ${bcConfigSet.boundedContextName}, schemaVersion: ${bcConfigSet.schemaVersion} and iterationNumber: ${bcConfigSet.iterationNumber}, IGNORING with error`);
                throw new CannotCreateOverridePreviousVersionConfigSetError("Invalid schemaVersion");
            }
        }

        //apply default values - if creating a new version, the current values should be copied from the old version
        this._applyCurrentOrDefaultParamValues(bcConfigSet.parameters, latestVersion ? latestVersion.parameters : null);
        this._applyCurrentOrDefaultFeatureFlagValues(bcConfigSet.featureFlags, latestVersion ? latestVersion.featureFlags : null);
        this._applyCurrentOrDefaultSecretValues(bcConfigSet.secrets, latestVersion ? latestVersion.secrets : null);

        // new configsets get 0 iterationNumber, newer versions of existing ones continue from the previous
        bcConfigSet.iterationNumber = !latestVersion ? 0 : latestVersion.iterationNumber;

        this._logger.info(`received BC configuration set for BC: ${bcConfigSet.boundedContextName}, schemaVersion: ${bcConfigSet.schemaVersion} and iterationNumber: ${bcConfigSet.iterationNumber}`);

        try{
            await this._bcConfigSetRepo.storeBoundedContextConfigSet(bcConfigSet);
        }catch(err){
            this._logger.error(err);
            throw new CouldNotStoreConfigSetError();
        }

        // TODO: add audit security context
        // const secCtx: SecurityContext = {
        //     userId: "userid",
        //     appId: null,
        //     role: "role"
        // }
        await this._auditClient.audit(AuditActions.BoundedContextConfigSet_SchemaVersionCreated, true);

        await this._notifyNewSchema_bcConfigs(bcConfigSet);
    }

    async processChangeBoundedContextConfigSetValuesCmd(secCtx: CallSecurityContext, cmdPayload: BoundedContextConfigSetChangeValuesCmdPayload):Promise<void> {
        this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.CHANGE_VALUES_BOUNDED_CONTEXT);

        const bcConfigSet = await this._getLatestBoundedContextConfigSet(cmdPayload.boundedContextName);

        if(!bcConfigSet){
            return Promise.reject(new BoundedContextConfigurationSetNotFoundError());
        }

        if (cmdPayload.schemaVersion !== bcConfigSet.schemaVersion){
            return Promise.reject(new OnlyLatestSchemaVersionCanBeChangedError());
        }

        if (cmdPayload.iterationNumber !== bcConfigSet.iterationNumber){
            return Promise.reject(new OnlyLatestIterationCanBeChangedError());
        }

        // TODO return multiple errors instead of just one

        cmdPayload.newValues.forEach((value) => {
            if(value.type.toUpperCase() === ConfigItemTypes.PARAMETER){
                const param = bcConfigSet!.parameters.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!param){
                    throw new ParameterNotFoundError();
                }
                param.currentValue = value.value;
            }else if(value.type.toUpperCase() === ConfigItemTypes.FEATUREFLAG){
                const featureFlag = bcConfigSet!.featureFlags.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!featureFlag){
                    throw new ParameterNotFoundError();
                }
                featureFlag.currentValue = value.value as boolean;
            }else if(value.type.toUpperCase() === ConfigItemTypes.SECRET){
                const secret = bcConfigSet!.secrets.find(item => item.name.toUpperCase() === value.name.toUpperCase());
                if(!secret){
                    throw new ParameterNotFoundError();
                }
                secret.currentValue = value.value.toString();
            }else {
                throw new ParameterNotFoundError();
            }
            return;
        });

        bcConfigSet.iterationNumber++;

        try{
            await this._bcConfigSetRepo.storeBoundedContextConfigSet(bcConfigSet);
        }catch(err){
            this._logger.error(err);
            throw new CouldNotStoreConfigSetError();
        }

        // TODO: add audit security context
        // const secCtx: SecurityContext = {
        //     userId: "userid",
        //     appId: null,
        //     role: "role"
        // }
        await this._auditClient.audit(AuditActions.BoundedContextConfigSet_ValuesChanged, true);

        await this._notifyNewValues_bcConfigs(bcConfigSet);
    }

    /**************************************
     * Global config set code
     ************************************/

    private _validateGlobalConfigSet(globalConfigSet:GlobalConfigurationSet):boolean{
        if(!globalConfigSet.schemaVersion) {
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

        // detect differences - 0.2 should be different from the coerced 0.2.0 and invalid input
        let parsed = semver.coerce(globalConfigSet.schemaVersion);
        if(!parsed || parsed.raw != globalConfigSet.schemaVersion) {
            // the 2nd check assures that formats like "v1.0.1" which are considered valid by semver are rejected, we want strict semver
            return false;
        }

        parsed = semver.coerce(globalConfigSet.schemaVersion);
        if(!parsed || parsed.raw != globalConfigSet.schemaVersion) {
            // the 2nd check assures that formats like "v1.0.1" which are considered valid by semver are rejected, we want strict semver
            return false;
        }

        return true;
    }

    private async _getLatestGlobalConfigSet(): Promise<GlobalConfigurationSet | null>{
        try{
            const latestVersion: GlobalConfigurationSet | null = await this._globalConfigSetRepo.fetchLatestGlobalConfigSet();
            return latestVersion;
        }catch(err){
            this._logger.error(err);
            return null;
        }
    }

    //async processCreateGlobalConfigSetCmd(secCtx: CallSecurityContext, globalConfigSet:GlobalConfigurationSet):Promise<void>{
    // NOTE to be called only from the service boostrap, not via RESP
    async bootstrapGlobalConfigSet(globalConfigSet:GlobalConfigurationSet):Promise<void>{
        //this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.BOOSTRAP_GLOBAL);

        // TODO validate the configSet
        if(!this._validateGlobalConfigSet(globalConfigSet)){
            this._logger.warn(`invalid global configuration set schemaVersion: ${globalConfigSet?.schemaVersion} and iterationNumber: ${globalConfigSet?.iterationNumber}, ERROR `);
            throw new InvalidGlobalConfigurationSetError();
        }

        const latestVersion: GlobalConfigurationSet | null = await this._getLatestGlobalConfigSet();

        if(latestVersion) {
            if (semver.compare(latestVersion.schemaVersion, globalConfigSet.schemaVersion)==0) {
                this._logger.warn(`received duplicate global configuration set for for schemaVersion: ${globalConfigSet?.schemaVersion} and iterationNumber: ${globalConfigSet?.iterationNumber}, IGNORING `);
                throw new CannotCreateDuplicateConfigSetError();
            } else if (semver.compare(latestVersion.schemaVersion, globalConfigSet.schemaVersion)==1) {
                this._logger.error(`received global configuration set with lower version than latest for schemaVersion: ${globalConfigSet?.schemaVersion} and iterationNumber: ${globalConfigSet?.iterationNumber}, IGNORING with error`);
                throw new CannotCreateOverridePreviousVersionConfigSetError();
            }
        }

        // validate default value for parameters of type list and object against type definition
        globalConfigSet.parameters.forEach(param => {
            const errorMessage = this._validateJsonTypeDefinition(param, param.defaultValue);
            if(errorMessage){
                throw new InvalidGlobalConfigurationSetError("Invalid default value " + errorMessage);
            }
        });

        //apply default values - if creating a new version, the current values should be copied from the old version
        this._applyCurrentOrDefaultParamValues(globalConfigSet.parameters, latestVersion ? latestVersion.parameters : null);
        this._applyCurrentOrDefaultFeatureFlagValues(globalConfigSet.featureFlags, latestVersion ? latestVersion.featureFlags : null);
        this._applyCurrentOrDefaultSecretValues(globalConfigSet.secrets, latestVersion ? latestVersion.secrets : null);


        // new configsets get 0 iterationNumber, newer versions of existing ones continue from the previous
        globalConfigSet.iterationNumber = !latestVersion ? 0 : latestVersion.iterationNumber;

        this._logger.info(`received configuration set for schemaVersion: ${globalConfigSet?.schemaVersion} and iterationNumber: ${globalConfigSet?.iterationNumber}`);

        try{
            await this._globalConfigSetRepo.storeGlobalConfigSet(globalConfigSet);
        }catch(err){
            this._logger.error(err);
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

    async getAllGlobalConfigSets(secCtx: CallSecurityContext): Promise<GlobalConfigurationSet[]>{
        this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.VIEW_GLOBAL);

        try{
            const allVersions: GlobalConfigurationSet [] = await this._globalConfigSetRepo.fetchGlobalBoundedContextConfigSets();
            return allVersions;
        }catch(err){
            this._logger.error(err);
            return [];
        }
    }

    async getGlobalConfigSetVersion(secCtx: CallSecurityContext, version:string): Promise<GlobalConfigurationSet | null>{
        this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.VIEW_GLOBAL);

        try{
            const specificVersion: GlobalConfigurationSet | null = await this._globalConfigSetRepo.fetchGlobalConfigSetVersion(version);
            return specificVersion;
        }catch(err){
            this._logger.error(err);
            return null;
        }
    }

    async getLatestGlobalConfigSet(secCtx: CallSecurityContext, ): Promise<GlobalConfigurationSet | null>{
        this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.VIEW_GLOBAL);

        return this._getLatestGlobalConfigSet();
    }



    async processChangeGlobalConfigSetValuesCmd(secCtx: CallSecurityContext, cmdPayload: GlobalConfigSetChangeValuesCmdPayload):Promise<void> {
        this._enforcePrivilege(secCtx, PlatformConfigurationPrivileges.CHANGE_VALUES_GLOBAL);

        const globalConfigSet = await this._getLatestGlobalConfigSet();

        if(!globalConfigSet){
            return Promise.reject(new GlobalConfigurationSetNotFoundError());
        }

        if (cmdPayload.schemaVersion !== globalConfigSet.schemaVersion){
            return Promise.reject(new OnlyLatestSchemaVersionCanBeChangedError());
        }

        if (cmdPayload.iterationNumber !== globalConfigSet.iterationNumber){
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

        try{
            await this._globalConfigSetRepo.storeGlobalConfigSet(globalConfigSet);
        }catch(err){
            this._logger.error(err);
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
