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
    ConfigFeatureFlag,
    ConfigParameter,
    ConfigParameterTypes,
    ConfigSecret,
    ConfigurationSet,
} from "@mojaloop/platform-configuration-bc-types-lib";
import {IAppConfiguration, IGlobalConfiguration} from "./configuration_interfaces";



export class ConfigurationSetWrapper implements IAppConfiguration, IGlobalConfiguration{
    private _environmentName: string;
    private _schemaVersion: string;
    private _iterationNumber: number;

    private readonly _parameters: Map<string, ConfigParameter>;
    private readonly _featureFlags: Map<string, ConfigFeatureFlag>;
    private readonly _secrets: Map<string, ConfigSecret>;

    constructor(environmentName: string, schemaVersion?:string) {
        this._environmentName = environmentName;
        this._iterationNumber = 0;
        if(schemaVersion) this._schemaVersion = schemaVersion;

        this._parameters = new Map<string, ConfigParameter>();
        this._featureFlags = new Map<string, ConfigFeatureFlag>();
        this._secrets = new Map<string, ConfigSecret>();
    }

    get schemaVersion(): string {
        return this._schemaVersion;
    }

    get iterationNumber(): number {
        return this._iterationNumber;
    }

    has(name: string): boolean {
        let found = false;
        const upperCaseName = name.toUpperCase();

        for (const key of this._parameters.keys()) {
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
        return [...this._parameters.keys(), ...this._featureFlags.keys(), ...this._secrets.keys()];
    }

    public ApplyFromEnvVars(prefix:string){
        for(const paramName of this._parameters.keys()){
            const envVarName = prefix+paramName.toUpperCase();
            if(process.env[envVarName] != undefined){
                const value = this._getParamValueFromString(this._parameters.get(paramName)!, process.env[envVarName]!);
                this._setParamValue(paramName, value);
            }
        }

        for(const featureFlagName of this._featureFlags.keys()){
            const envVarName = prefix+featureFlagName.toUpperCase();
            if(process.env[envVarName] != undefined){
                const value = process.env[envVarName]!.toLowerCase() === "true";
                this._setFeatureFlagValue(featureFlagName, value);
            }
        }

        for(const secretName of this._secrets.keys()){
            const envVarName = prefix+secretName.toUpperCase();
            if(process.env[envVarName] != undefined){
                this._setSecretValue(secretName, process.env[envVarName]!);
            }
        }
    }

    public ToJsonObj():ConfigurationSet{
        return {
            environmentName: this._environmentName,
            schemaVersion: this._schemaVersion,
            iterationNumber: this._iterationNumber,
            parameters: Array.from(this._parameters.values()),
            featureFlags: Array.from(this._featureFlags.values()),
            secrets: Array.from(this._secrets.values())
        };
    }

    /**
     * Note: this does not enforce matching env or schemaVersion
     * @param data
     * @constructor
     */
    public SetFromJsonObj(data:ConfigurationSet):void{
        this._environmentName = data.environmentName;
        this._schemaVersion = data.schemaVersion;
        this._iterationNumber = data.iterationNumber;

        // clear all first
        this._parameters.clear();
        this._featureFlags.clear();
        this._secrets.clear();

        for(const param of data.parameters){
            this.addNewParam(param.name, param.type, param.defaultValue, param.description);
            this._setParamValue(param.name, param.currentValue);
        }

        for(const featureFlag of data.featureFlags){
            this.addNewFeatureFlag(featureFlag.name, featureFlag.defaultValue, featureFlag.description);
            this._setFeatureFlagValue(featureFlag.name, featureFlag.currentValue);
        }

        for(const secret of data.secrets){
            this.addNewSecret(secret.name, secret.defaultValue, secret.description);
            this._setSecretValue(secret.name, secret.currentValue);
        }
    }

    /*************************
     * params
     **************************/

    addParam(param: ConfigParameter): void {
        if (this.has(param.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${param.name}`);
        }

        this._parameters.set(param.name.toUpperCase(), param);
    }

    addNewParam(name: string, type: ConfigParameterTypes, defaultValue: any, description: string): void {
        const param:ConfigParameter = {
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

        this._parameters.set(param.name.toUpperCase(), param);
    }

    getParam(paramName: string): ConfigParameter | null {
        return this._parameters.get(paramName.toUpperCase()) ?? null;
    }

    getAllParams(): ConfigParameter[] {
        return Array.from(this._parameters.values());
    }

    private _getParamValueFromString(param: ConfigParameter, value:string):any {
        if(param.type === ConfigParameterTypes.STRING){
            return value;
        }else if(param.type === ConfigParameterTypes.BOOL){
            return (value.toLowerCase() === "true");
        }else if(param.type === ConfigParameterTypes.INT_NUMBER){
            return parseInt(value);
        }else if(param.type === ConfigParameterTypes.FLOAT_NUMBER) {
            return parseFloat(value);
        }
    }

    private _setParamValue(paramName:string, value:any):void{
        const param: ConfigParameter | null = this._parameters.get(paramName.toUpperCase()) ?? null;
        if(!param) {
            throw("param does not exit, cannot set value");
        }

        param.currentValue = value;
    }

    /*************************
     * feature flags
     **************************/

    addFeatureFlag(featureFlag: ConfigFeatureFlag): void {
        if (this.has(featureFlag.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${featureFlag.name}`);
        }

        this._featureFlags.set(featureFlag.name.toUpperCase(), featureFlag);
    }

    addNewFeatureFlag(name: string, defaultValue: boolean, description: string): void {
        const featureFlag:ConfigFeatureFlag = {
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

    getFeatureFlag(featureFlagName: string): ConfigFeatureFlag | null {
        return this._featureFlags.get(featureFlagName.toUpperCase()) ?? null;
    }

    getAllFeatureFlags(): ConfigFeatureFlag[] {
        return Array.from(this._featureFlags.values());
    }

    private _setFeatureFlagValue(featureFlagName:string, value:boolean):void{
        const featureFlag: ConfigFeatureFlag | null = this._featureFlags.get(featureFlagName.toUpperCase()) ?? null;
        if(!featureFlag) {
            throw("featureFlag does not exit, cannot set value");
        }

        featureFlag.currentValue = value;
    }

    /*************************
     * secrets
     **************************/

    addSecret(secret: ConfigSecret): void {
        if (this.has(secret.name.toUpperCase())) {
            throw new Error(`Duplicate config name detected - name: ${secret.name}`);
        }

        this._secrets.set(secret.name.toUpperCase(), secret);
    }

    addNewSecret(name: string, defaultValue: string | null, description: string): void {
        const secret:ConfigSecret = {
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

    getSecret(secretName: string): ConfigSecret | null {
        return this._secrets.get(secretName.toUpperCase()) ?? null;
    }

    getAllSecrets(): ConfigSecret[] {
        return Array.from(this._secrets.values());
    }

    private _setSecretValue(secretName:string, value:string):void{
        const secret: ConfigSecret | null = this._secrets.get(secretName.toUpperCase()) ?? null;
        if(!secret) {
            throw("secret does not exit, cannot set value");
        }

        secret.currentValue = value;
    }
}
