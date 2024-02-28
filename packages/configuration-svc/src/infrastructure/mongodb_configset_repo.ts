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
    private readonly _databaseName: string = "configsets";
    private readonly _collectionNameGlobalConfigSets: string = "globalConfigsets";
    private readonly _collectionNameBcConfigSets: string = "bcConfigsets";
    private _globalConfigSets: GlobalConfigurationSet[] = [];
    private _bcConfigSets: Map<string, BoundedContextConfigurationSet[]> = new Map<string, BoundedContextConfigurationSet[]>();


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

        await this._loadFromGlobalConfigSets();
        await this._loadFromBcConfigSets();

        this._initialized = true;
        this._logger.info("MongoConfigSetRepo - initialized");

    }
    async destroy(): Promise<void> {
        if (this._initialized) await this._mongoClient.close();
    }

    private async _saveToGlobalConfigSets(globalConfigSet : GlobalConfigurationSet):Promise<void>{
        try {
            const result = await this._collectionGlobalConfigSets.insertOne({
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
            const result = await this._collectionBcConfigSets.insertOne({
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

    private async _loadFromGlobalConfigSets():Promise<void>{
        this._globalConfigSets = [];
        try{
            const mongoGlobalConfigSets = await this._collectionGlobalConfigSets.find({}).toArray();

            this._globalConfigSets = mongoGlobalConfigSets.map(doc => ({
                schemaVersion: doc.schemaVersion,
                iterationNumber: doc.iterationNumber,
                parameters: doc.parameters,
                featureFlags: doc.featureFlags,
                secrets: doc.secrets
              }))  || [];

        }catch (err) {
            this._logger.error(err);
            throw new Error("cannot load  MongoConfigSetRepo - globalConfigsets");
        }

        this._logger.info(`Successfully read file contents - globalConfigSet count: ${this._globalConfigSets.length}.`);
    }
    

    private async _loadFromBcConfigSets():Promise<void>{
        this._bcConfigSets.clear();
        try{
            const mongoBcConfigSets = await this._collectionBcConfigSets.find({}).toArray();

            const configMap = new Map<string, BoundedContextConfigurationSet[]>();
            mongoBcConfigSets.forEach(doc => {
                if (!configMap.has(doc.boundedContextName)) {
                    configMap.set(doc.boundedContextName, []);
                }
                configMap.get(doc.boundedContextName)?.push(doc);
            });

        }catch (err) {
            this._logger.error(err);
            throw new Error("cannot load  MongoConfigSetRepo bcConfigsets");
        }

        this._logger.info(`Successfully fetch contents - bcConfigSets count: ${this._bcConfigSets.size}`);
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

    private _getBoundedContextConfigVersions(bcName: string): BoundedContextConfigurationSet[] {
        const configs: BoundedContextConfigurationSet[] | undefined = this._bcConfigSets.get(this._configSetIdString(bcName));

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
        const allVersions: BoundedContextConfigurationSet[] = [];

        for (const key of this._bcConfigSets.keys()) {
            const versions = this._bcConfigSets.get(key) || [];
            allVersions.push(...versions);
        }

        if (allVersions.length <= 0) {
            return [];
        }

        return allVersions.map(value => this._deepCopyBoundedContextConfigSet(value));
    }

    // returns the latest iteration for the latest schema version
    async fetchLatestBoundedContextConfigSet(bcName: string): Promise<BoundedContextConfigurationSet | null> {
        const allVersions: BoundedContextConfigurationSet[] = this._getBoundedContextConfigVersions(bcName);
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
        const allVersions: BoundedContextConfigurationSet[] = this._getBoundedContextConfigVersions(bcName);
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
        // if not found this._getBoundedContextConfigVersions returns empty array
        const versions: BoundedContextConfigurationSet[] = this._getBoundedContextConfigVersions(bcConfigSet.boundedContextName);
        const found: boolean = versions.length > 0;

        // checks should happen in the caller agg, this should blindly overwrite
        versions.push(bcConfigSet);

        if (!found) {
            const idStr = this._configSetIdString(bcConfigSet.boundedContextName);
            this._bcConfigSets.set(idStr, versions);
        }

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
        // checks should happen in the caller agg, this should blindly overwrite
        this._globalConfigSets.push(globalConfigSet);

        await this._saveToGlobalConfigSets(globalConfigSet);

        this._logger.info(`Stored global configuration set with schemaVersion: ${globalConfigSet.schemaVersion} and iteration number: ${globalConfigSet.iterationNumber}`);
    }


    async fetchGlobalBoundedContextConfigSets(): Promise<GlobalConfigurationSet[]> {
        if (this._globalConfigSets.length <= 0)
            return [];

        // clone array
        const ret = this._globalConfigSets.slice(0);
        this._globalConfigSets.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);

        return ret.map(value => this._deepCopyGlobalConfigSet(value));
    }

    async fetchGlobalConfigSetVersion(version: string): Promise<GlobalConfigurationSet | null> {
        if (this._globalConfigSets.length <= 0) {
            return null;
        }

        // filter per version
        const ret = this._globalConfigSets.filter(value => value.schemaVersion === version);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0];

        return this._deepCopyGlobalConfigSet(lastIteraction) ?? null;
    }

    async fetchLatestGlobalConfigSet(): Promise<GlobalConfigurationSet | null> {
        if (this._globalConfigSets.length <= 0) {
            return null;
        }

        // clone array
        let ret = this._globalConfigSets.slice(0);

        // sort by decreasing version order (latest version first)
        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => semver.compare(b.schemaVersion, a.schemaVersion));
        const lastVersion = ret[0].schemaVersion;

        ret = ret.filter(value => value.schemaVersion === lastVersion);

        ret.sort((a: GlobalConfigurationSet, b: GlobalConfigurationSet) => b.iterationNumber - a.iterationNumber);
        const lastIteraction = ret[0];

        return this._deepCopyGlobalConfigSet(lastIteraction) ?? null;
    }

}