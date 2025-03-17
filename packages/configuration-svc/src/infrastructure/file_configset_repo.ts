/*****
License
--------------
Copyright © 2020-2025 Mojaloop Foundation
The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

Contributors
--------------
This is the official list of the Mojaloop project contributors for this file.
Names of the original copyright holders (individuals or organizations)
should be listed with a '*' in the first column. People who have
contributed from an organization can be listed under the organization
that actually holds the copyright for their contributions (see the
Mojaloop Foundation for an example). Those individuals should have
their names indented and be marked with a '-'. Email address can be added
optionally within square brackets <email>.

* Mojaloop Foundation
- Name Surname <name.surname@mojaloop.io>

* Crosslake
- Pedro Sousa Barreto <pedrob@crosslaketech.com>
*****/

"use strict";
import semver from "semver";
import {readFile, stat, writeFile} from "fs/promises";
import {IBoundedContextConfigSetRepository, IGlobalConfigSetRepository} from "@mojaloop/platform-configuration-bc-domain-lib";
import {GlobalConfigurationSet, BoundedContextConfigurationSet} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import fs from "fs";
import {watch} from "node:fs";


//type ConfigSetMap = Map<string, ConfigurationSet[]>;

declare type DataFileStruct = {
    globalConfigSets: GlobalConfigurationSet[],
    bcConfigSets: BoundedContextConfigurationSet[]
};

export class FileConfigSetRepo implements IBoundedContextConfigSetRepository, IGlobalConfigSetRepository{
    private readonly  _logger: ILogger;
    private readonly _filePath: string;
    private _globalConfigSet : GlobalConfigurationSet[] = [];
    private _bcConfigSets : Map<string, BoundedContextConfigurationSet[]> = new Map<string, BoundedContextConfigurationSet[]>();
    private _watching = false;
    private _saving = false;
    private _watcher: fs.FSWatcher | null = null;

    constructor(filePath:string, logger: ILogger) {
        this._logger = logger.createChild(this.constructor.name);
        this._filePath = filePath;

        this._logger.info(`Starting FileConfigSetRepo with file path: "${this._filePath}"`);
    }

    private async _loadFromFile():Promise<boolean>{
        this._globalConfigSet = [];
        this._bcConfigSets.clear();

        let fileData: DataFileStruct;
        try{
            const strContents = await readFile(this._filePath, "utf8");
            if(!strContents || !strContents.length){
                return false;
            }

            fileData = JSON.parse(strContents);

            this._globalConfigSet = fileData.globalConfigSets || [];

            for(const rec of fileData.bcConfigSets){
                    const id = this._configSetIdString(rec.boundedContextName);
                const existing = this._bcConfigSets.get(id);
                if (existing) {
                    existing.push(rec);
                }else{
                    this._bcConfigSets.set(id, [rec]);
                }
            }
        }catch (e) {
            throw new Error("cannot read FileConfigSetRepo storage file");
        }

        this._logger.info(`Successfully read file contents - globalConfigSet count: ${this._globalConfigSet.length} and bcConfigSets count: ${this._bcConfigSets.size}`);

        return true;
    }

    private async _saveToFile():Promise<void>{
        try{
            this._saving = true;
            const flatRecs: DataFileStruct = {
                globalConfigSets: [],
                bcConfigSets: []
            };

            flatRecs.globalConfigSets.push(...this._globalConfigSet);

            for(const configs of Array.from(this._bcConfigSets.values())){
                flatRecs.bcConfigSets.push(...configs);
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
        this._watcher = watch(this._filePath, async (eventType, filename) => {
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

    async destroy():Promise<void>{
        if(this._watcher){
            this._watcher.close();
            this._watcher = null;
            this._watching = false;
        }
    }

    /**************************************
     * BC config set code
     ************************************/

    private _deepCopyBoundedContextConfigSet(bcConfigSet:BoundedContextConfigurationSet):BoundedContextConfigurationSet{
        // we need this to de-reference the objects in memory when passing them to callers
        return JSON.parse(JSON.stringify(bcConfigSet));
    }


    private _configSetIdString(bcName:string): string{
        return bcName.toUpperCase();
    }

    private _getBoundedContextConfigVersions(bcName:string):BoundedContextConfigurationSet[]{
        const configs:BoundedContextConfigurationSet[] | undefined = this._bcConfigSets.get(this._configSetIdString(bcName));

        if(!configs) {
            return [];
        }

        // sort by decreasing schemaVersion order (latest version first)
        configs.sort((a: BoundedContextConfigurationSet, b: BoundedContextConfigurationSet) => semver.compare(b.schemaVersion, a.schemaVersion));

        return configs;
    }

    private _getBoundedContextConfigLatestIteration(completeVersionConfigs:BoundedContextConfigurationSet[], schemaVersion:string):BoundedContextConfigurationSet | null{
        const versionConfigSets: BoundedContextConfigurationSet[] = completeVersionConfigs.filter(value => value.schemaVersion === schemaVersion);

        if(versionConfigSets.length <=0 ){
            return null;
        }

        versionConfigSets.sort((a: BoundedContextConfigurationSet, b: BoundedContextConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = versionConfigSets[0];

        return lastIteraction ?? null;
    }

    async fetchAllBoundedContextConfigSets(): Promise<BoundedContextConfigurationSet[]> {
        const allVersions:BoundedContextConfigurationSet[] = [];

        for(const key of this._bcConfigSets.keys()){
            const versions = this._bcConfigSets.get(key) || [];
            allVersions.push(...versions);
        }

        if(allVersions.length <= 0){
            return [];
        }

        return allVersions.map(value => this._deepCopyBoundedContextConfigSet(value));
    }

    // returns the latest iteration for the latest schema version
    async fetchLatestBoundedContextConfigSet(bcName: string): Promise<BoundedContextConfigurationSet | null> {
        const allVersions:BoundedContextConfigurationSet[] = this._getBoundedContextConfigVersions(bcName);
        if(allVersions.length <= 0){
            return null;
        }

        const latestVersion = allVersions[0].schemaVersion;
        const lastPatch = this._getBoundedContextConfigLatestIteration(allVersions, latestVersion);

        if(!lastPatch){
            return null;
        }

        return this._deepCopyBoundedContextConfigSet(lastPatch);
    }

    async fetchBoundedContextConfigSetVersion(bcName: string, version:string): Promise<BoundedContextConfigurationSet | null> {
        const allVersions:BoundedContextConfigurationSet[] = this._getBoundedContextConfigVersions(bcName);
        if(allVersions.length <= 0){
            return null;
        }

        const lastPatch = this._getBoundedContextConfigLatestIteration(allVersions, version);

        if(!lastPatch){
            return null;
        }

        return this._deepCopyBoundedContextConfigSet(lastPatch);
    }

    async storeBoundedContextConfigSet(bcConfigSet: BoundedContextConfigurationSet): Promise<void> {
        // if not found this._getBoundedContextConfigVersions returns empty array
        const versions: BoundedContextConfigurationSet[] = this._getBoundedContextConfigVersions(bcConfigSet.boundedContextName);
        const found:boolean = versions.length > 0;

        // checks should happen in the caller agg, this should blindly overwrite
        versions.push(bcConfigSet);

        if(!found){
            const idStr = this._configSetIdString(bcConfigSet.boundedContextName);
            this._bcConfigSets.set(idStr, versions);
        }

        await this._saveToFile();

        this._logger.info(`Stored BC configuration set for BC: ${bcConfigSet.boundedContextName}, schemaVersion: ${bcConfigSet.schemaVersion} and iteration number: ${bcConfigSet.iterationNumber}`);
    }

    /**************************************
     * Global config set code
     ************************************/

    private _deepCopyGlobalConfigSet(globalConfigSet:GlobalConfigurationSet):GlobalConfigurationSet{
        // we need this to de-reference the objects in memory when passing them to callers
        return JSON.parse(JSON.stringify(globalConfigSet));
    }

    // global config set specific
    async storeGlobalConfigSet(globalConfigSet:GlobalConfigurationSet):Promise<void>{
        // checks should happen in the caller agg, this should blindly overwrite
        this._globalConfigSet.push(globalConfigSet);

        await this._saveToFile();

        this._logger.info(`Stored global configuration set with schemaVersion: ${globalConfigSet.schemaVersion} and iteration number: ${globalConfigSet.iterationNumber}`);
    }


    async fetchGlobalBoundedContextConfigSets():Promise<GlobalConfigurationSet[]>{
        if(this._globalConfigSet.length <= 0)
            return [];

        // clone array
        const ret = this._globalConfigSet.slice(0);
        this._globalConfigSet.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);

        return ret.map(value => this._deepCopyGlobalConfigSet(value));
    }

    async fetchGlobalConfigSetVersion(version:string):Promise<GlobalConfigurationSet | null>{
        if(this._globalConfigSet.length <=0 ){
            return null;
        }

        // filter per version
        const ret = this._globalConfigSet.filter(value => value.schemaVersion === version);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0];

        return this._deepCopyGlobalConfigSet(lastIteraction) ?? null;
    }

    async fetchLatestGlobalConfigSet():Promise<GlobalConfigurationSet | null>{
        if(this._globalConfigSet.length <=0 ){
            return null;
        }

        // clone array
        let ret = this._globalConfigSet.slice(0);

        // sort by decreasing version order (latest version first)
        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => semver.compare(b.schemaVersion, a.schemaVersion));
        const lastVersion = ret[0].schemaVersion;

        ret = ret.filter(value => value.schemaVersion === lastVersion);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0];

        return this._deepCopyGlobalConfigSet(lastIteraction) ?? null;
    }
}
