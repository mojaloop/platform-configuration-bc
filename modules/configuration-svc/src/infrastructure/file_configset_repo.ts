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
import semver from "semver";
import {readFile, stat, writeFile} from "fs/promises";
import {IAppConfigSetRepository, IGlobalConfigSetRepository} from "@mojaloop/platform-configuration-bc-domain-lib";
import {GlobalConfigurationSet, AppConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import fs from "fs";


//type ConfigSetMap = Map<string, ConfigurationSet[]>;

declare type DataFileStruct = {
    globalConfigSets: GlobalConfigurationSet[],
    appConfigSets: AppConfigurationSet[]
};

export class FileConfigSetRepo implements IAppConfigSetRepository, IGlobalConfigSetRepository{
    private readonly _filePath: string;
    private readonly  _logger: ILogger;
    private _globalConfigSet : GlobalConfigurationSet[] = [];
    private _appConfigSets : Map<string, AppConfigurationSet[]> = new Map<string, AppConfigurationSet[]>();

    constructor(filePath:string, logger: ILogger) {
        this._logger = logger;
        this._filePath = filePath;
    }

    private async _loadFromFile():Promise<boolean>{
        let fileData: DataFileStruct;
        try{
            const strContents = await readFile(this._filePath, "utf8");
            if(!strContents || !strContents.length){
                return false;
            }

            fileData = JSON.parse(strContents);

            this._globalConfigSet = fileData.globalConfigSets || [];

            for(const rec of fileData.appConfigSets){
                    const id = this._configSetIdString(rec.environmentName, rec.boundedContextName, rec.applicationName);
                const existing = this._appConfigSets.get(id);
                if (existing) {
                    existing.push(rec);
                }else{
                    this._appConfigSets.set(id, [rec]);
                }
            }
        }catch (e) {
            throw new Error("cannot read FileConfigSetRepo storage file");
        }
        return true;
    }

    private async _saveToFile():Promise<void>{
        try{
            const flatRecs: DataFileStruct = {
                globalConfigSets: [],
                appConfigSets: []
            };

            flatRecs.globalConfigSets.push(...this._globalConfigSet);

            for(const configs of Array.from(this._appConfigSets.values())){
                flatRecs.appConfigSets.push(...configs);
            }

            const strContents = JSON.stringify(flatRecs, null, 4);
            await writeFile(this._filePath, strContents, "utf8");
        }catch (e) {
            throw new Error("cannot rewrite FileConfigSetRepo storage file");
        }
    }

    async init(): Promise<void>{
        const exists = fs.existsSync(this._filePath);

        if(fs.existsSync(this._filePath)){
            const loadSuccess = await this._loadFromFile();
            if(!loadSuccess){
                throw new Error("Error loading FileConfigSetRepo file")
            }else{
                this._logger.info(`FileConfigSetRepo - loaded ${this._appConfigSets.size} configsets at init`);
            }
        }
    }

    /**************************************
     * App config set code
     ************************************/

    private _deepCopyAppConfigSet(appConfigSet:AppConfigurationSet):AppConfigurationSet{
        // we need this to de-reference the objects in memory when passing them to callers
        return JSON.parse(JSON.stringify(appConfigSet));
    }

    private _configSetIdString(envName:string, bcName:string, appName:string): string{
        return envName.toUpperCase()+"::"+bcName.toUpperCase()+"::"+appName.toUpperCase();
    }

    private _getAppConfigVersions(envName:string, bcName:string, appName:string):AppConfigurationSet[]{
        const configs:AppConfigurationSet[] | undefined = this._appConfigSets.get(this._configSetIdString(envName, bcName, appName));

        if(!configs) {
            return [];
        }

        // sort by decreasing version order (latest version first)
        configs.sort((a: AppConfigurationSet, b: AppConfigurationSet) => semver.compare(b.applicationVersion, a.applicationVersion));

        return configs;
    }

    private _getAppConfigLatestIteration(completeVersionConfigs:AppConfigurationSet[], version:string):AppConfigurationSet | null{
        const versionConfigSets: AppConfigurationSet[] = completeVersionConfigs.filter(value => value.applicationVersion === version);

        if(versionConfigSets.length <=0 ){
            return null;
        }

        versionConfigSets.sort((a: AppConfigurationSet, b: AppConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = versionConfigSets[0]

        return lastIteraction ?? null;
    }

    async fetchAllAppConfigSets(envName:string): Promise<AppConfigurationSet[]> {
        const allVersions:AppConfigurationSet[] = [];

        for(const key of this._appConfigSets.keys()){
            const versions = this._appConfigSets.get(key) || [];
            for(const version of versions){
                if(version.environmentName.toUpperCase() === envName.toUpperCase()){
                    allVersions.push(version);
                }
            }
        }

        if(allVersions.length <= 0){
            return [];
        }

        return allVersions;
    }

    async fetchLatestAppConfigSet(envName:string, bcName: string, appName: string): Promise<AppConfigurationSet | null> {
        const allVersions:AppConfigurationSet[] = this._getAppConfigVersions(envName, bcName, appName);
        if(allVersions.length <= 0){
            return null;
        }

        const latestVersion = allVersions[0].applicationVersion;
        const lastPatch = this._getAppConfigLatestIteration(allVersions, latestVersion)

        if(!lastPatch){
            return null;
        }

        return this._deepCopyAppConfigSet(lastPatch);
    }

    async fetchAppConfigSetVersion(envName:string, bcName: string, appName: string, version:string): Promise<AppConfigurationSet | null> {
        const allVersions:AppConfigurationSet[] = this._getAppConfigVersions(envName, bcName, appName);
        if(allVersions.length <= 0){
            return null;
        }

        const lastPatch = this._getAppConfigLatestIteration(allVersions, version)

        if(!lastPatch){
            return null;
        }

        return this._deepCopyAppConfigSet(lastPatch);
    }

    async storeAppConfigSet(appConfigSet: AppConfigurationSet): Promise<boolean> {
        // if not found this._getAppConfigVersions returns empty array
        const versions: AppConfigurationSet[] = this._getAppConfigVersions(appConfigSet.environmentName, appConfigSet.boundedContextName, appConfigSet.applicationName);
        const found:boolean = versions.length > 0;

        // checks should happen in the caller agg, this should blindly overwrite
        versions.push(appConfigSet)

        if(!found){
            const idStr = this._configSetIdString(appConfigSet.environmentName, appConfigSet.boundedContextName, appConfigSet.applicationName);
            this._appConfigSets.set(idStr, versions);
        }

        await this._saveToFile();

        this._logger.info(`In env:  ${appConfigSet.environmentName} - stored app configuration set for BC: ${appConfigSet.boundedContextName}, APP: ${appConfigSet.applicationName}, version: ${appConfigSet.applicationVersion} and iteration number: ${appConfigSet.iterationNumber}`);
        return true;
    }

    /**************************************
     * Global config set code
     ************************************/

    // global config set specific
    async storeGlobalConfigSet(globalConfigSet:GlobalConfigurationSet):Promise<boolean>{
        // checks should happen in the caller agg, this should blindly overwrite
        this._globalConfigSet.push(globalConfigSet)

        await this._saveToFile();

        this._logger.info(`In env:  ${globalConfigSet.environmentName} - stored global configuration set with version: ${globalConfigSet.version} and iteration number: ${globalConfigSet.iterationNumber}`);
        return true;
    }

    async fetchGlobalAppConfigSets(envName:string):Promise<GlobalConfigurationSet[]>{
        if(this._globalConfigSet.length <= 0)
            return [];

        // filter per env
        const ret = this._globalConfigSet.filter(value => value.environmentName.toUpperCase() === envName.toUpperCase());
        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);

        return ret;
    }

    async fetchLatestGlobalConfigSet(envName:string):Promise<GlobalConfigurationSet | null>{
        if(this._globalConfigSet.length <=0 ){
            return null;
        }

        // filter per env
        let ret = this._globalConfigSet.filter(value => value.environmentName.toUpperCase() === envName.toUpperCase());
        // sort by decreasing version order (latest version first)
        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => semver.compare(b.version, a.version));
        const lastVersion = ret[0].version;

        ret = ret.filter(value => value.version === lastVersion);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0]

        return lastIteraction ?? null;
    }
}
