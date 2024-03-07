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

import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { MongoClient, Collection } from "mongodb";
import { IBoundedContextConfigSetRepository, IGlobalConfigSetRepository } from "@mojaloop/platform-configuration-bc-domain-lib";
import { GlobalConfigurationSet, BoundedContextConfigurationSet } from "@mojaloop/platform-configuration-bc-public-types-lib";
import semver from "semver";

export class MongoConfigSetRepo implements IBoundedContextConfigSetRepository, IGlobalConfigSetRepository {
    private _mongoUri: string;
    private _logger: ILogger;
    private _mongoClient: MongoClient;
    protected _collectionGlobalConfigSets: Collection<GlobalConfigurationSet>;
    protected _collectionBcConfigSets: Collection<BoundedContextConfigurationSet>;
    private _initialized: boolean = false;
    private readonly _databaseName: string = "platform-configuration";
    private readonly _collectionNameGlobalConfigSets: string = "globalConfigsets";
    private readonly _collectionNameBcConfigSets: string = "bcConfigsets";

    constructor(_mongoUri: string, logger: ILogger) {
        this._logger = logger.createChild(this.constructor.name);
        this._mongoUri = _mongoUri;
    }

    async init(): Promise<void> {
        try {
            this._mongoClient = await MongoClient.connect(this._mongoUri);
        } catch (err: any) {
            this._logger.error(err);
            this._logger.isWarnEnabled() &&
                this._logger.warn(
                    `MongoConfigSetRepo - init failed with error: ${err?.message?.toString()}`
                );
            throw err;
        }

        if (this._mongoClient === null)
            throw new Error("Couldn't instantiate mongo client");

        const db = this._mongoClient.db(this._databaseName);

        const collections = await db.listCollections().toArray();

        // Check if the GlobalConfigSet collection already exists or create.
        if (collections.find((col) => col.name === this._collectionNameGlobalConfigSets)) {
            this._collectionGlobalConfigSets = db.collection(this._collectionNameGlobalConfigSets);
        } else {
            this._collectionGlobalConfigSets = await db.createCollection(this._collectionNameGlobalConfigSets);         
        }

        // Check if the BCConfigSet collection already exists or create.
        if (collections.find((col) => col.name === this._collectionNameBcConfigSets) ) {
            this._collectionBcConfigSets = db.collection(this._collectionNameBcConfigSets);
        } else {
            this._collectionBcConfigSets = await db.createCollection(this._collectionNameBcConfigSets);
        }

        this._initialized = true;
        this._logger.info("MongoConfigSetRepo - initialized");

    }
    async destroy(): Promise<void> {
        if (this._initialized) await this._mongoClient.close();
    }

    private async _saveToGlobalConfigSets(globalConfigSet : GlobalConfigurationSet):Promise<void>{
        try {
            await this._collectionGlobalConfigSets.insertOne({
                    schemaVersion: globalConfigSet.schemaVersion,
                    iterationNumber: globalConfigSet.iterationNumber,
                    parameters: globalConfigSet.parameters,
                    featureFlags: globalConfigSet.featureFlags,
                    secrets: globalConfigSet.secrets
                }
            );
        }catch (err) {
            this._logger.error(err);
            throw new Error("cannot save to mongodb global config");
        } 
    }

    private async _saveToBcConfigSets(bcConfigSet:BoundedContextConfigurationSet):Promise<void>{
        try {
            await this._collectionBcConfigSets.insertOne({
                schemaVersion: bcConfigSet.schemaVersion,
                iterationNumber: bcConfigSet.iterationNumber,
                parameters: bcConfigSet.parameters,
                featureFlags: bcConfigSet.featureFlags,
                secrets: bcConfigSet.secrets,
                boundedContextName : bcConfigSet.boundedContextName
            });
        }catch (err) {
            this._logger.error(err);
            throw new Error("cannot save to mongodb boundedcontext config");
        } 
    }


    /**************************************
     * BC config set code
     ************************************/

    private _deepCopyBoundedContextConfigSet(bcConfigSet: BoundedContextConfigurationSet): BoundedContextConfigurationSet {
        // we need this to de-reference the objects in memory when passing them to callers
        return JSON.parse(JSON.stringify(bcConfigSet));
    }


    private _configSetIdString(bcName: string): string {
        return bcName.toUpperCase();
    }

    private async _getBoundedContextConfigVersions(bcName: string): Promise<BoundedContextConfigurationSet[]> {

        const configs = await this._collectionBcConfigSets.find({boundedContextName : bcName}).toArray(); 
        if (!configs) {
            return [];
        }

        // sort by decreasing schemaVersion order (latest version first)
        configs.sort((a: BoundedContextConfigurationSet, b: BoundedContextConfigurationSet) => semver.compare(b.schemaVersion, a.schemaVersion));

        return configs;
    }

    private _getBoundedContextConfigLatestIteration(completeVersionConfigs: BoundedContextConfigurationSet[], schemaVersion: string): BoundedContextConfigurationSet | null {
        const versionConfigSets: BoundedContextConfigurationSet[] = completeVersionConfigs.filter(value => value.schemaVersion === schemaVersion);

        if (versionConfigSets.length <= 0) {
            return null;
        }

        versionConfigSets.sort((a: BoundedContextConfigurationSet, b: BoundedContextConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = versionConfigSets[0];

        return lastIteraction ?? null;
    }

    async fetchAllBoundedContextConfigSets(): Promise<BoundedContextConfigurationSet[]> {

        const allVersions: BoundedContextConfigurationSet[] = await this._collectionBcConfigSets.find({}).toArray(); 

        if (allVersions.length <= 0) {
            return [];
        }

        return allVersions.map(value => this._deepCopyBoundedContextConfigSet(value));

    }

    // returns the latest iteration for the latest schema version
    async fetchLatestBoundedContextConfigSet(bcName: string): Promise<BoundedContextConfigurationSet | null> {
        const allVersions: BoundedContextConfigurationSet[] = await this._getBoundedContextConfigVersions(bcName);
        if (allVersions.length <= 0) {
            return null;
        }

        const latestVersion = allVersions[0].schemaVersion;
        const lastPatch = this._getBoundedContextConfigLatestIteration(allVersions, latestVersion);

        if (!lastPatch) {
            return null;
        }

        return this._deepCopyBoundedContextConfigSet(lastPatch);
    }

    async fetchBoundedContextConfigSetVersion(bcName: string, version: string): Promise<BoundedContextConfigurationSet | null> {
        const allVersions: BoundedContextConfigurationSet[] = await this._getBoundedContextConfigVersions(bcName);
        if (allVersions.length <= 0) {
            return null;
        }

        const lastPatch = this._getBoundedContextConfigLatestIteration(allVersions, version);

        if (!lastPatch) {
            return null;
        }

        return this._deepCopyBoundedContextConfigSet(lastPatch);
    }

    async storeBoundedContextConfigSet(bcConfigSet: BoundedContextConfigurationSet): Promise<void> {
        
        await this._saveToBcConfigSets(bcConfigSet);

        this._logger.info(`Stored BC configuration set for BC: ${bcConfigSet.boundedContextName}, schemaVersion: ${bcConfigSet.schemaVersion} and iteration number: ${bcConfigSet.iterationNumber}`);
    }

    /**************************************
     * Global config set code
     ************************************/

    private _deepCopyGlobalConfigSet(globalConfigSet: GlobalConfigurationSet): GlobalConfigurationSet {
        // we need this to de-reference the objects in memory when passing them to callers
        return JSON.parse(JSON.stringify(globalConfigSet));
    }

    // global config set specific
    async storeGlobalConfigSet(globalConfigSet: GlobalConfigurationSet): Promise<void> {

        await this._saveToGlobalConfigSets(globalConfigSet);

        this._logger.info(`Stored global configuration set with schemaVersion: ${globalConfigSet.schemaVersion} and iteration number: ${globalConfigSet.iterationNumber}`);
    }


    async fetchGlobalBoundedContextConfigSets(): Promise<GlobalConfigurationSet[]> {

        const globalConfigSets = await this._collectionGlobalConfigSets.find({}).toArray();

        if (globalConfigSets.length <= 0)
            return [];

        // clone array
        const ret = globalConfigSets.slice(0);
        globalConfigSets.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);

        return ret.map(value => this._deepCopyGlobalConfigSet(value));
    }

    async fetchGlobalConfigSetVersion(version: string): Promise<GlobalConfigurationSet | null> {

        const globalConfigSets = await this._collectionGlobalConfigSets.find({}).toArray();
        if (globalConfigSets.length <= 0) {
            return null;
        }

        // filter per version
        const ret = globalConfigSets.filter(value => value.schemaVersion === version);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0];

        return this._deepCopyGlobalConfigSet(lastIteraction) ?? null;
    }

    async fetchLatestGlobalConfigSet(): Promise<GlobalConfigurationSet | null> {
   
        const globalConfigSets = await this._collectionGlobalConfigSets.find({}).toArray();
        if (globalConfigSets.length <= 0) {
            return null;
        }

        // clone array
        let ret = globalConfigSets.slice(0);

        // sort by decreasing version order (latest version first)
        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => semver.compare(b.schemaVersion, a.schemaVersion));
        const lastVersion = ret[0].schemaVersion;

        ret = ret.filter(value => value.schemaVersion === lastVersion);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0];

        return this._deepCopyGlobalConfigSet(lastIteraction) ?? null;
    }

}