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

import {IConfigSetRepository} from "../domain/iconfigset_repo";
import {IConfigurationSet, IConfigurationSetId} from "@mojaloop/platform-configuration-bc-types-lib";
import {ILogger} from "@mojaloop/logging-bc-logging-client-lib";

export class InMemoryConfigSetRepo implements IConfigSetRepository{
    private _logger: ILogger;
    private _configSets : Map<string, IConfigurationSet[]> = new Map<string, IConfigurationSet[]>();

    constructor(logger: ILogger) {
        this._logger = logger;
    }

    private _deepCopy(configSet:IConfigurationSet):IConfigurationSet{
        // we need this to de-reference the objects in memory when passing them to callers
        return JSON.parse(JSON.stringify(configSet));
    }

    private _configSetIdString(bcName:string, appName:string): string{
        return bcName.toUpperCase()+"::"+appName.toUpperCase();
    }

    private _getConfigVersions(bcName:string, appName:string):IConfigurationSet[]{

        const configs:IConfigurationSet[] | undefined = this._configSets.get(this._configSetIdString(bcName, appName));

        if(!configs) {
            return [];
        }

        configs.sort((a: IConfigurationSet, b: IConfigurationSet) => b.id.versionNumber - a.id.versionNumber);

        return configs;
    }

    private _getLatestPatch(completeVersionConfigs:IConfigurationSet[], versionNumber:number):IConfigurationSet | null{
        const latestVersionPatches: IConfigurationSet[] = completeVersionConfigs.filter(value => value.id.versionNumber == versionNumber);

        if(latestVersionPatches.length <=0 ){
            return null;
        }

        latestVersionPatches.sort((a: IConfigurationSet, b: IConfigurationSet) => b.id.patchNumber - a.id.patchNumber);
        const lastPatch = latestVersionPatches[0]

        return lastPatch ?? null;
    }

    fetchLatest(bcName: string, appName: string): Promise<IConfigurationSet | null> {
        const allVersions:IConfigurationSet[] = this._getConfigVersions(bcName, appName);
        if(allVersions.length <= 0){
            return Promise.resolve(null);
        }

        const latestVersion = allVersions[0].id.versionNumber;
        const lastPatch = this._getLatestPatch(allVersions, latestVersion)

        if(!lastPatch){
            return Promise.resolve(null);
        }

        return Promise.resolve(this._deepCopy(lastPatch));
    }

    fetchVersion(bcName: string, appName: string, version: number): Promise<IConfigurationSet | null> {
        const allVersions:IConfigurationSet[] = this._getConfigVersions(bcName, appName);
        if(allVersions.length <= 0){
            return Promise.resolve(null);
        }

        const lastPatch = this._getLatestPatch(allVersions, version)

        if(!lastPatch){
            return Promise.resolve(null);
        }

        return Promise.resolve(this._deepCopy(lastPatch));
    }
/*

    has(bcName:string, appName:string):Promise<boolean>{
        const idStr = this._configSetIdString(bcName, appName);
        return Promise.resolve(this._configSets.has(idStr));
    }

    hasVersion(bcName:string, appName:string, version:number): Promise<boolean>{
        const idStr = this._configSetIdString(bcName, appName);
        const versions: IConfigurationSet[] = this._getConfigVersions(bcName, appName);

        return Promise.resolve(undefined !== versions.find(value => value.id.version ==version));
    }
*/

    store(configSet: IConfigurationSet): Promise<boolean> {
        const idStr = this._configSetIdString(configSet.id.boundedContext, configSet.id.application);

        // if not found this._getConfigVersions returns empty array
        const versions: IConfigurationSet[] = this._getConfigVersions(configSet.id.boundedContext, configSet.id.application);

        // if(versions.length > 0){
        //     const index = versions.findIndex(value => value.id.version == configSet.id.version);
        //     if(index < 0){
        //         this._logger.error(`cannot find version to update in repo.store - for BC: ${configSet.id.boundedContext}, APP: ${configSet.id.application} and version: ${configSet.id.version}`);
        //         return Promise.resolve(false);
        //     }
        //     versions[index] = configSet;
        // }else{
        //     versions.push(configSet)
        // }

        // checkes should happen in the caller agg
        versions.push(configSet)
        this._configSets.set(idStr, versions);

        this._logger.info(`stored configuration set for BC: ${configSet.id.boundedContext}, APP: ${configSet.id.application}, version: ${configSet.id.versionNumber} and patch: ${configSet.id.patchNumber}`);
        return Promise.resolve(true);
    }


}

//////////////
// TODO move map and related functions to its own storage and retrieval class



//////////////
