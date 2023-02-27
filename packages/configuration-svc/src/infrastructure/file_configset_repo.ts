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
import semver from "semver";
import {readFile, stat, writeFile} from "fs/promises";
import {IAppConfigSetRepository, IGlobalConfigSetRepository} from "@mojaloop/platform-configuration-bc-domain-lib";
import {GlobalConfigurationSet, AppConfigurationSet} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import fs from "fs";
import {watch} from "node:fs";


//type ConfigSetMap = Map<string, ConfigurationSet[]>;

declare type DataFileStruct = {
    globalConfigSets: GlobalConfigurationSet[],
    appConfigSets: AppConfigurationSet[]
};

export class FileConfigSetRepo implements IAppConfigSetRepository, IGlobalConfigSetRepository{
    private readonly  _logger: ILogger;
    private readonly _filePath: string;
    private _globalConfigSet : GlobalConfigurationSet[] = [];
    private _appConfigSets : Map<string, AppConfigurationSet[]> = new Map<string, AppConfigurationSet[]>();
    private _watching = false;
    private _saving = false;

    constructor(filePath:string, logger: ILogger) {
        this._logger = logger.createChild(this.constructor.name);
        this._filePath = filePath;
    }

    private async _loadFromFile():Promise<boolean>{
        this._globalConfigSet = [];
        this._appConfigSets.clear();

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

        this._logger.info(`Successfully read file contents - globalConfigSet count: ${this._globalConfigSet.length} and appConfigSets count: ${this._appConfigSets.size}`);

        return true;
    }

    private async _saveToFile():Promise<void>{
        try{
            this._saving = true;
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
            this._ensureIsWatching();
        }catch (e) {
            throw new Error("cannot rewrite FileConfigSetRepo storage file");
        } finally {
            this._saving = false;
        }
    }

    private _ensureIsWatching() {
        if (this._watching) return;

        let fsWait: NodeJS.Timeout | undefined; // debounce wait
        watch(this._filePath, async (eventType, filename) => {
            if (this._saving) return;
            if (eventType==="change") {
                if (fsWait) return;
                fsWait = setTimeout(() => {
                    fsWait = undefined;
                }, 100);
                this._logger.info(`FileIAMAdapter file changed,  with file path: "${this._filePath}" - reloading...`);
                await this._loadFromFile();
            }
        });
        this._watching = true;
    }

    async init(): Promise<void>{
        const exists = fs.existsSync(this._filePath);

        // if not exists we skip, it will be loaded after
        if(!exists){
            this._logger.warn("FileConfigSetRepo data file does not exist, will be created at first write - filepath: "+this._filePath);
            return;
        }

        const loadSuccess = await this._loadFromFile();
        if(!loadSuccess){
            throw new Error("Error loading FileConfigSetRepo file");
        }

        this._ensureIsWatching();
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

        // sort by decreasing schemaVersion order (latest version first)
        configs.sort((a: AppConfigurationSet, b: AppConfigurationSet) => semver.compare(b.schemaVersion, a.schemaVersion));

        return configs;
    }

    private _getAppConfigLatestIteration(completeVersionConfigs:AppConfigurationSet[], schemaVersion:string):AppConfigurationSet | null{
        const versionConfigSets: AppConfigurationSet[] = completeVersionConfigs.filter(value => value.schemaVersion === schemaVersion);

        if(versionConfigSets.length <=0 ){
            return null;
        }

        versionConfigSets.sort((a: AppConfigurationSet, b: AppConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = versionConfigSets[0];

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

        return allVersions.map(value => this._deepCopyAppConfigSet(value));
    }

    // returns the latest iteration for the latest schema version
    async fetchLatestAppConfigSet(envName:string, bcName: string, appName: string): Promise<AppConfigurationSet | null> {
        const allVersions:AppConfigurationSet[] = this._getAppConfigVersions(envName, bcName, appName);
        if(allVersions.length <= 0){
            return null;
        }

        const latestVersion = allVersions[0].schemaVersion;
        const lastPatch = this._getAppConfigLatestIteration(allVersions, latestVersion);

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

        const lastPatch = this._getAppConfigLatestIteration(allVersions, version);

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
        versions.push(appConfigSet);

        if(!found){
            const idStr = this._configSetIdString(appConfigSet.environmentName, appConfigSet.boundedContextName, appConfigSet.applicationName);
            this._appConfigSets.set(idStr, versions);
        }

        await this._saveToFile();

        this._logger.info(`In env:  ${appConfigSet.environmentName} - stored app configuration set for BC: ${appConfigSet.boundedContextName}, APP: ${appConfigSet.applicationName}, appVersion: ${appConfigSet.applicationVersion}, schemaVersion: ${appConfigSet.schemaVersion} and iteration number: ${appConfigSet.iterationNumber}`);
        return true;
    }

    /**************************************
     * Global config set code
     ************************************/

    private _deepCopyGlobalConfigSet(globalConfigSet:GlobalConfigurationSet):GlobalConfigurationSet{
        // we need this to de-reference the objects in memory when passing them to callers
        return JSON.parse(JSON.stringify(globalConfigSet));
    }

    // global config set specific
    async storeGlobalConfigSet(globalConfigSet:GlobalConfigurationSet):Promise<boolean>{
        // checks should happen in the caller agg, this should blindly overwrite
        this._globalConfigSet.push(globalConfigSet);

        await this._saveToFile();

        this._logger.info(`In env:  ${globalConfigSet.environmentName} - stored global configuration set with schemaVersion: ${globalConfigSet.schemaVersion} and iteration number: ${globalConfigSet.iterationNumber}`);
        return true;
    }


    async fetchGlobalAppConfigSets(envName:string):Promise<GlobalConfigurationSet[]>{
        if(this._globalConfigSet.length <= 0)
            return [];

        // filter per env
        const ret = this._globalConfigSet.filter(value => value.environmentName.toUpperCase() === envName.toUpperCase());
        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);

        return ret.map(value => this._deepCopyGlobalConfigSet(value));
    }

    async fetchGlobalConfigSetVersion(envName:string, version:string):Promise<GlobalConfigurationSet | null>{
        if(this._globalConfigSet.length <=0 ){
            return null;
        }

        // filter per env and version
        const ret = this._globalConfigSet.filter(value => value.environmentName.toUpperCase() === envName.toUpperCase() && value.schemaVersion === version);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0];

        return this._deepCopyGlobalConfigSet(lastIteraction) ?? null;
    }

    async fetchLatestGlobalConfigSet(envName:string):Promise<GlobalConfigurationSet | null>{
        if(this._globalConfigSet.length <=0 ){
            return null;
        }

        // filter per env
        let ret = this._globalConfigSet.filter(value => value.environmentName.toUpperCase() === envName.toUpperCase());
        // sort by decreasing version order (latest version first)
        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => semver.compare(b.schemaVersion, a.schemaVersion));
        const lastVersion = ret[0].schemaVersion;

        ret = ret.filter(value => value.schemaVersion === lastVersion);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0];

        return this._deepCopyGlobalConfigSet(lastIteraction) ?? null;
    }
}
