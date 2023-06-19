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
import {
    BoundedContextConfigurationSet,
    ConfigItemTypes
} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {
    ConfigSetAggregate,
    BoundedContextConfigSetChangeValuesCmdPayload,
    CannotCreateDuplicateConfigSetError,
    CannotCreateOverridePreviousVersionConfigSetError,
    CouldNotStoreConfigSetError,
    InvalidBoundedContextConfigurationSetError,
    BoundedContextConfigurationSetNotFoundError,
    ParameterNotFoundError,
    OnlyLatestIterationCanBeChangedError,
    OnlyLatestSchemaVersionCanBeChangedError
} from "@mojaloop/platform-configuration-bc-domain-lib";

export class BoundedContextConfigsRoutes {
    private _logger: ILogger;
    private _agg: ConfigSetAggregate;
    private _router = express.Router();


    constructor(aggregate: ConfigSetAggregate, logger: ILogger) {
        this._logger = logger;
        this._agg = aggregate;

        // bind routes - per BC config sets
        this._router.post( "/bootstrap", this._bcConfigSet_postBootstrap.bind(this));
        this._router.get("/:env", this._bcConfigSet_getAll.bind(this));
        this._router.get("/:env/:bc", this._bcConfigSet_getByBC.bind(this));
        this._router.post("/:env/:bc", this._bcConfigSet_setValues.bind(this));
    }

    get Router(): express.Router {
        return this._router;
    }

    // handlers - per BC config sets
    private async _bcConfigSet_postBootstrap(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const data: BoundedContextConfigurationSet = req.body;
        this._logger.debug(data);

        await this._agg.processCreateBoundedContextConfigSetCmd(data).then((success) => {
            res.status(200).json({status: "ok"});
        }).catch((error: Error) => {
            if (error instanceof CannotCreateDuplicateConfigSetError) {
                res.status(409).json({
                    status: "error",
                    msg: "received duplicated BC configuration set, cannot update"
                });
            } else if (error instanceof CannotCreateOverridePreviousVersionConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "received BC configuration set has lower id than latest available, cannot update"
                });
            } else if (error instanceof InvalidBoundedContextConfigurationSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "invalid BC configuration set"
                });
            } else {
                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }

    private async _bcConfigSet_getAll(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;

        // validate
        if (!envParam || envParam==="" ) {
            this._logger.warn("Invalid environment param received");
            res.sendStatus(400);
            return;
        }

        const retBoundedContextConfigSets: BoundedContextConfigurationSet[] = await this._agg.getAllBoundedContextConfigSets(envParam);

        if (!retBoundedContextConfigSets) {
            this._logger.debug("no BC configuration sets found");
            res.sendStatus(404);
            return;
        }
        res.status(200).json(retBoundedContextConfigSets);
    }

    private async _bcConfigSet_getByBC(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;
        const ownerBcParam = req.params["bc"] ?? null;
        // optional query param
        const versionParam = req.query["version"]?.toString() ?? null;

        // validate
        if (!envParam || envParam==="" || !ownerBcParam || ownerBcParam==="") {
            this._logger.warn("Invalid BC configuration set request received");
            res.sendStatus(400);
            return;
        }

        let retBoundedContextConfigSet: BoundedContextConfigurationSet | null;

        if (!versionParam) {
            retBoundedContextConfigSet = await this._agg.getLatestBoundedContextConfigSet(envParam, ownerBcParam);
        } else {
            retBoundedContextConfigSet = await this._agg.getBoundedContextConfigSetVersion(envParam, ownerBcParam, versionParam);
        }

        if (!retBoundedContextConfigSet) {
            this._logger.debug("bc configuration set not found");
            res.sendStatus(404);
            return;
        }
        res.status(200).json(retBoundedContextConfigSet);
        return;
    }

    private async _bcConfigSet_setValues(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const envParam = req.params["env"] ?? null;
        const ownerBcParam = req.params["bc"] ?? null;


        // optional query param
        //const versionParam = req.query["version"]?.toString() ?? null;

        // validate owner, BC and version
        if (!envParam || !ownerBcParam ) {
            res.status(400).json({
                status: "error",
                msg: "invalid request"
            });
            return;
        }

        const cmdPayload: BoundedContextConfigSetChangeValuesCmdPayload = {
            environmentName: envParam,
            boundedContextName: ownerBcParam,
            schemaVersion: req.body.schemaVersion,
            iterationNumber: req.body.iterationNumber,
            newValues: req.body.newValues
        };

        await this._agg.processChangeBoundedContextConfigSetValuesCmd(cmdPayload).then(()=>{
            return res.status(200).send({status: "ok"});
        }).catch(error => {
            // TODO should return multiple errors
            if (error instanceof BoundedContextConfigurationSetNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "bc configuration set not found"
                });
            }else if (error instanceof ParameterNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "parameter set not found"
                });
            }else if (error instanceof CouldNotStoreConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "Not able to store BC configuration set"
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
