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
import {IConfigSetRepository} from "../domain/iconfigset_repo";
import {ConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import fs from "fs";


type ConfigSetMap = Map<string, ConfigurationSet[]>;

export class FileConfigSetRepo implements IConfigSetRepository{
    private _filePath: string;
    private _logger: ILogger;
    private _configSets : Map<string, ConfigurationSet[]> = new Map<string, ConfigurationSet[]>();

    constructor(filePath:string, logger: ILogger) {
        this._logger = logger;
        this._filePath = filePath;
    }

    private async _loadFromFile():Promise<boolean>{
        let fileData: ConfigurationSet[];
        try{
            const strContents = await readFile(this._filePath, "utf8");
            if(!strContents || !strContents.length){
                return false;
            }

            fileData = JSON.parse(strContents);

            for(const rec of fileData){
                    const id = this._configSetIdString(rec.environmentName, rec.boundedContextName, rec.applicationName);
                const existing = this._configSets.get(id);
                if (existing) {
                    existing.push(rec);
                }else{
                    this._configSets.set(id, [rec]);
                }
            }
        }catch (e) {
            throw new Error("cannot read FileConfigSetRepo storage file");
        }

        return true;
    }

    private async _saveToFile():Promise<void>{
        try{
            const flatRecs: ConfigurationSet[] = [];
            for(const configs of Array.from(this._configSets.values())){
                flatRecs.push(...configs);
            }
            const strContents = JSON.stringify(flatRecs, null, 4);
            await writeFile(this._filePath, strContents, "utf8");
        }catch (e) {
            throw new Error("cannot rewrite FileConfigSetRepo storage file");
        }
    }

    private _deepCopy(configSet:ConfigurationSet):ConfigurationSet{
        // we need this to de-reference the objects in memory when passing them to callers
        return JSON.parse(JSON.stringify(configSet));
    }

    private _configSetIdString(envName:string, bcName:string, appName:string): string{
        return envName.toUpperCase()+"::"+bcName.toUpperCase()+"::"+appName.toUpperCase();
    }

    private _getConfigVersions(envName:string, bcName:string, appName:string):ConfigurationSet[]{
        const configs:ConfigurationSet[] | undefined = this._configSets.get(this._configSetIdString(envName, bcName, appName));

        if(!configs) {
            return [];
        }

        // sort by decreasing version order (latest version first)
        configs.sort((a: ConfigurationSet, b: ConfigurationSet) => semver.compare(b.applicationVersion, a.applicationVersion));

        return configs;
    }

    private _getLatestIteration(completeVersionConfigs:ConfigurationSet[], version:string):ConfigurationSet | null{
        const versionConfigSets: ConfigurationSet[] = completeVersionConfigs.filter(value => value.applicationVersion === version);

        if(versionConfigSets.length <=0 ){
            return null;
        }

        versionConfigSets.sort((a: ConfigurationSet, b: ConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = versionConfigSets[0]

        return lastIteraction ?? null;
    }

    async init(): Promise<void>{
        const exists = fs.existsSync(this._filePath);

        if(fs.existsSync(this._filePath)){
            const loadSuccess = await this._loadFromFile();
            if(!loadSuccess){
                throw new Error("Error loading FileConfigSetRepo file")
            }else{
                this._logger.info(`FileConfigSetRepo - loaded ${this._configSets.size} configsets at init`);
            }
        }
    }

    async fetchAll(): Promise<ConfigurationSet[]> {
        const allVersions:ConfigurationSet[] = [];


        for(const key of this._configSets.keys()){
            const versions = this._configSets.get(key) || [];
            allVersions.push(...versions);
        }

        if(allVersions.length <= 0){
            return [];
        }

        return allVersions;
    }


    async fetchLatest(envName:string, bcName: string, appName: string): Promise<ConfigurationSet | null> {
        const allVersions:ConfigurationSet[] = this._getConfigVersions(envName, bcName, appName);
        if(allVersions.length <= 0){
            return null;
        }

        const latestVersion = allVersions[0].applicationVersion;
        const lastPatch = this._getLatestIteration(allVersions, latestVersion)

        if(!lastPatch){
            return null;
        }

        return this._deepCopy(lastPatch);
    }

    async  fetchVersion(envName:string, bcName: string, appName: string, version:string): Promise<ConfigurationSet | null> {
        const allVersions:ConfigurationSet[] = this._getConfigVersions(envName, bcName, appName);
        if(allVersions.length <= 0){
            return null;
        }


        const lastPatch = this._getLatestIteration(allVersions, version)

        if(!lastPatch){
            return null;
        }

        return this._deepCopy(lastPatch);
    }

    async store(configSet: ConfigurationSet): Promise<boolean> {
        // if not found this._getConfigVersions returns empty array
        const versions: ConfigurationSet[] = this._getConfigVersions(configSet.environmentName, configSet.boundedContextName, configSet.applicationName);
        const found:boolean = versions.length > 0;

        // checks should happen in the caller agg, this should blindly overwrite
        versions.push(configSet)

        if(!found){
            const idStr = this._configSetIdString(configSet.environmentName, configSet.boundedContextName, configSet.applicationName);
            this._configSets.set(idStr, versions);
        }

        await this._saveToFile();

        this._logger.info(`In env:  ${configSet.environmentName} - stored configuration set for BC: ${configSet.boundedContextName}, APP: ${configSet.applicationName}, version: ${configSet.applicationVersion} and iteration number: ${configSet.iterationNumber}`);
        return true;
    }


}

//////////////
// TODO move map and related functions to its own storage and retrieval class



//////////////
