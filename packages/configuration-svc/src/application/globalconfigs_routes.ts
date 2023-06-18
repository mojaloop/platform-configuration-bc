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
import express from "express";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import { ConfigItemTypes,GlobalConfigurationSet } from "@mojaloop/platform-configuration-bc-public-types-lib";
import {
    ConfigSetAggregate,
    GlobalConfigSetChangeValuesCmdPayload,
    CannotCreateDuplicateConfigSetError, GlobalConfigurationSetNotFoundError,
    CannotCreateOverridePreviousVersionConfigSetError,
    InvalidGlobalConfigurationSetError, CouldNotStoreConfigSetError,
    ParameterNotFoundError, OnlyLatestSchemaVersionCanBeChangedError, OnlyLatestIterationCanBeChangedError
} from "@mojaloop/platform-configuration-bc-domain-lib";

export class GlobalConfigsRoutes {
    private _logger: ILogger;
    private _agg: ConfigSetAggregate;
    private _router = express.Router();

    constructor(aggregate: ConfigSetAggregate, logger: ILogger) {
        this._logger = logger;
        this._agg = aggregate;

        // bind routes - global config sets
        this._router.post("/bootstrap", this._globalConfigSet_postBootstrap.bind(this));
        this._router.get("/:env", this._globalConfigSet_get.bind(this));
        this._router.post("/:env/setvalues", this._globalConfigSet_setValues.bind(this));
    }

    get Router(): express.Router {
        return this._router;
    }

    // handlers - global config sets
    private async _globalConfigSet_postBootstrap(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const data: GlobalConfigurationSet = req.body;
        //this._logger.debug(data);

        await this._agg.processCreateGlobalConfigSetCmd(data).then((success) => {
            res.status(200).json({status: "ok"});
        }).catch((error: Error) => {
            if (error instanceof CannotCreateDuplicateConfigSetError) {
                res.status(409).json({
                    status: "error",
                    msg: "received duplicated global configuration set, cannot update"
                });
            } else if (error instanceof CannotCreateOverridePreviousVersionConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "received global configuration set has lower id than latest available, cannot update"
                });
            } else if (error instanceof InvalidGlobalConfigurationSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "invalid global configuration set" + (error.message ? " - " + error.message : "")
                });
            } else {
                res.status(500).json({
                    status: "error",
                    msg: "unknown error" + (error.message ? " - " + error.message : "")
                });
            }
        });
    }

    private async _globalConfigSet_get(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;

        // optional query param
        const versionParam = req.query["version"]?.toString() ?? null;
        const latestParam = req.query["latest"]?.toString() ?? null;

        // validate
        if (!envParam || envParam==="" ) {
            this._logger.warn("Invalid global configuration set request received");
            res.send(400).json({
                status: "error",
                msg: "Invalid global configuration set request received"
            });
            return;
        }

        let retGlobalConfigSets: GlobalConfigurationSet[] = [];

        if (latestParam !== null) {
            const item = await this._agg.getLatestGlobalConfigSet(envParam);
            if(item) retGlobalConfigSets.push(item);
        } else if(versionParam){
            const item = await this._agg.getGlobalConfigSetVersion(envParam, versionParam);
            if(item) retGlobalConfigSets.push(item);
        }else{
            retGlobalConfigSets = await this._agg.getAllGlobalConfigSets(envParam);
        }

        if (retGlobalConfigSets.length <= 0) {
            this._logger.debug("global configset not found");
            res.sendStatus(404);
            return;
        }
        res.status(200).json(retGlobalConfigSets);
        return;
    }

    private async _globalConfigSet_setValues(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;

        if (!envParam || envParam==="") {
            res.status(400).json({
                status: "error",
                msg: "invalid request"
            });
            return;
        }

        const bodyObj:{
            schemaVersion: string,
            iteration: number,
            newValues: [{
                type: ConfigItemTypes,
                name: string,
                value: any
            }]
        } = req.body;

        const cmdPayload: GlobalConfigSetChangeValuesCmdPayload = {
            environmentName: envParam,
            schemaVersion: bodyObj.schemaVersion,
            iteration: bodyObj.iteration,
            newValues: bodyObj.newValues
        };

        await this._agg.processChangeGlobalConfigSetValuesCmd(cmdPayload).then(()=>{
            return res.status(200).send({status: "ok"});
        }).catch(error => {
            // TODO should return multiple errors
            if (error instanceof GlobalConfigurationSetNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "global configuration set not found"
                });
            }else if (error instanceof ParameterNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "parameter set not found"
                });
            }else if (error instanceof CouldNotStoreConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "Not able to store global configuration set"
                });
            }else if (error instanceof OnlyLatestSchemaVersionCanBeChangedError) {
                res.status(400).json({
                    status: "error",
                    msg: "Changes can only be made to the latest schema version of the global configuration set"
                });
            }else if (error instanceof OnlyLatestIterationCanBeChangedError) {
                res.status(400).json({
                    status: "error",
                    msg: "Changes can only be made to the latest iteration of the global configuration set"
                });
            }else{
                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }
}
