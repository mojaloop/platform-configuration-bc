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

import {
    ConfigParameterTypes, IConfigFeatureFlag, IConfigParameter, IConfigSecret, IConfigurationSet, IConfigurationSetId
} from "@mojaloop/platform-configuration-bc-types-lib";
import {IConfigProvider} from "./iconfig_provider";

export class ConfigurationSet {
    private readonly _configProvider:IConfigProvider;
    private readonly _boundedContext: string;
    private readonly _application: string;
    private readonly _versionNumber: number;
    private _patchNumber: number;
    private readonly _params: Map<string, IConfigParameter>;
    private readonly _featureFlags: Map<string, IConfigFeatureFlag>;
    private readonly _secrets: Map<string, IConfigSecret>;

    constructor(_boundedContext: string, _application: string, _version: number, configProvider:IConfigProvider) {
        this._configProvider = configProvider;
        this._boundedContext = _boundedContext;
        this._application = _application;
        this._versionNumber = _version;
        this._patchNumber = 0;

        this._params = new Map<string, IConfigParameter>();
        this._featureFlags = new Map<string, IConfigFeatureFlag>();
        this._secrets = new Map<string, IConfigSecret>();
    }

    get boundedContext(): string {
        return this._boundedContext;
    }

    get application(): string {
        return this._application;
    }

    get versionNumber(): number {
        return this._versionNumber;
    }

    get patchNumber(): number {
        return this._patchNumber;
    }

    async init(): Promise<void>{
        await this._configProvider.init();

        this._applyFromEnvVars();
    }

    async fetch(versionNumber?:number): Promise<void>{
        if(!versionNumber) versionNumber = this._versionNumber;

        const configSetDto:IConfigurationSet|null = await this._configProvider.fetch(this._boundedContext, this._application, versionNumber);
        if(null === configSetDto){
            // TODO log
            throw new Error(`Could not fetch configurationSet for BC: ${this._boundedContext} - APP: ${this._application} - VERSION: ${this._versionNumber} - PATCH: ${this._patchNumber}`);
        }

        // TODO check that ID matches

        this._fromJsonObj(configSetDto);

        this._applyFromEnvVars(); // env vars always take priority
    }

    async bootstrap(): Promise<boolean>{
        return this._configProvider.boostrap(this.toJsonObj());
    }

    has(name: string): boolean {
        let found = false;
        const upperCaseName = name.toUpperCase();

        for (const key of this._params.keys()) {
            if (key.toUpperCase()===upperCaseName) found = true;
        }
        for (const key of this._featureFlags.keys()) {
            if (key.toUpperCase()===upperCaseName) found = true;
        }
        for (const key of this._secrets.keys()) {
            if (key.toUpperCase()===upperCaseName) found = true;
        }

        return found;
    }

    allKeys(): string[] {
        return [...this._params.keys(), ...this._featureFlags.keys(), ...this._secrets.keys()];
    }


    toJsonObj():IConfigurationSet{
        return {
            id:{
                boundedContext: this._boundedContext,
                application: this._application,
                versionNumber: this._versionNumber,
                patchNumber: this._patchNumber,
            },
            params: Array.from(this._params.values()),
            featureFlags: Array.from(this._featureFlags.values()),
            secrets: Array.from(this._secrets.values())
        }
    }

    private _fromJsonObj(data:IConfigurationSet):void{
        // clear all first
        this._params.clear();
        this._featureFlags.clear();
        this._secrets.clear();

        //this._boundedContext = data.id.boundedContext;
        //this._application = data.id.application;
        //this._versionNumber = data.id.versionNumber;
        this._patchNumber = data.id.patchNumber;

        for(const param of data.params){
            this.addNewParam(param.name, param.type, param.defaultValue, param.description);
            this.setParamValue(param.name, param.currentValue);
        }

        for(const featureFlag of data.featureFlags){
            this.addNewFeatureFlag(featureFlag.name, featureFlag.defaultValue, featureFlag.description);
            this.setFeatureFlagValue(featureFlag.name, featureFlag.currentValue);
        }

        for(const secret of data.secrets){
            this.addNewSecret(secret.name, secret.defaultValue, secret.description);
            this.setSecretValue(secret.name, secret.currentValue);
        }
    }

    private _applyFromEnvVars(){
        // TODO: add _applyFromEnvVars() method
    }

    /*************************
     * params
     **************************/

    addParam(param: IConfigParameter): void {
        if (this.has(param.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${param.name}`);
        }

        this._params.set(param.name.toUpperCase(), param)
    }

    addNewParam(name: string, type: ConfigParameterTypes, defaultValue: any, description: string): void {
        const param:IConfigParameter = {
            name: name,
            type: type,
            defaultValue: defaultValue,
            description: description,
            currentValue: defaultValue
        };

        // TODO validate

        if (this.has(param.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${name}`);
        }

        this._params.set(param.name.toUpperCase(), param);
    }

    getParam(paramName: string): IConfigParameter | null {
        return this._params.get(paramName.toUpperCase()) ?? null;
    }

    getAllParams(): IConfigParameter[] {
        return Array.from(this._params.values());
    }

    setParamValue(paramName:string, value:any){
        const param: IConfigParameter | null = this._params.get(paramName.toUpperCase()) ?? null;
        if(!param) {
            throw("param does not exit, cannot set value");
        }

        param.currentValue = value;
    }

    /*************************
     * feature flags
     **************************/

    addFeatureFlag(featureFlag: IConfigFeatureFlag): void {
        if (this.has(featureFlag.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${featureFlag.name}`);
        }

        this._featureFlags.set(featureFlag.name.toUpperCase(), featureFlag);
    }

    addNewFeatureFlag(name: string, defaultValue: boolean, description: string): void {
        const featureFlag:IConfigFeatureFlag = {
            name: name,
            defaultValue: defaultValue,
            description: description,
            currentValue: defaultValue
        };
        if (this.has(featureFlag.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${name}`);
        }

        this._featureFlags.set(featureFlag.name.toUpperCase(), featureFlag);
    }

    getFeatureFlag(featureFlagName: string): IConfigFeatureFlag | null {
        return this._featureFlags.get(featureFlagName.toUpperCase()) ?? null;
    }

    getAllFeatureFlags(): IConfigFeatureFlag[] {
        return Array.from(this._featureFlags.values());
    }

    setFeatureFlagValue(featureFlagName:string, value:boolean){
        const featureFlag: IConfigFeatureFlag | null = this._featureFlags.get(featureFlagName.toUpperCase()) ?? null;
        if(!featureFlag) {
            throw("featureFlag does not exit, cannot set value");
        }

        featureFlag.currentValue = value;
    }

    /*************************
     * secrets
     **************************/

    addSecret(secret: IConfigSecret): void {
        if (this.has(secret.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${secret.name}`);
        }

        this._secrets.set(secret.name.toUpperCase(), secret);
    }

    addNewSecret(name: string, defaultValue: string | null, description: string): void {
        const secret:IConfigSecret = {
          name: name,
          defaultValue: defaultValue,
          description: description,
          currentValue: defaultValue ?? ""
        };

        if (this.has(secret.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${name}`);
        }

        this._secrets.set(secret.name.toUpperCase(), secret);
    }

    getSecret(secretName: string): IConfigSecret | null {
        return this._secrets.get(secretName.toUpperCase()) ?? null;
    }

    getAllSecrets(): IConfigSecret[] {
        return Array.from(this._secrets.values());
    }

    setSecretValue(secretName:string, value:string){
        const secret: IConfigSecret | null = this._secrets.get(secretName.toUpperCase()) ?? null;
        if(!secret) {
            throw("secret does not exit, cannot set value");
        }

        secret.currentValue = value;
    }
}
