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
import {TokenHelper} from "@mojaloop/security-bc-client-lib";
import {
    ForbiddenError,
    MakerCheckerViolationError,
    UnauthorizedError,
    CallSecurityContext,
} from "@mojaloop/security-bc-public-types-lib";
import {
    BCCONFIGSET_URL_RESOURCE_NAME,
    BoundedContextConfigurationSet, GLOBALCONFIGSET_URL_RESOURCE_NAME, GlobalConfigurationSet,
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
    OnlyLatestSchemaVersionCanBeChangedError,
    InvalidGlobalConfigurationSetError,
    GlobalConfigSetChangeValuesCmdPayload,
    GlobalConfigurationSetNotFoundError
} from "@mojaloop/platform-configuration-bc-domain-lib";

// Extend express request to include our security fields
declare module "express-serve-static-core" {
    export interface Request {
        securityContext: null | CallSecurityContext;
    }
}

export class PlatformConfigsRoutes {
    private _logger: ILogger;
    private _agg: ConfigSetAggregate;
    private _tokenHelper: TokenHelper;
    private _router = express.Router();


    constructor(aggregate: ConfigSetAggregate, logger: ILogger, tokenHelper: TokenHelper) {
        this._logger = logger.createChild(this.constructor.name);
        this._agg = aggregate;
        this._tokenHelper = tokenHelper;

        // inject authentication - all request below this require a valid token
        this._router.use(this._authenticationMiddleware.bind(this));

        // bind routes - per BC config sets
        this._router.post( `/${BCCONFIGSET_URL_RESOURCE_NAME}/bootstrap`, this._bcConfigSet_postBootstrap.bind(this));
        this._router.get(`/${BCCONFIGSET_URL_RESOURCE_NAME}/`, this._bcConfigSet_getAll.bind(this));
        this._router.get(`/${BCCONFIGSET_URL_RESOURCE_NAME}/:bc`, this._bcConfigSet_getByBC.bind(this));
        this._router.post(`/${BCCONFIGSET_URL_RESOURCE_NAME}/:bc`, this._bcConfigSet_setValues.bind(this));

        // bind routes - global config sets
        // bootstrap of global is no directly from this svc, not via REST
        //this._router.post(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}/bootstrap`, this._globalConfigSet_postBootstrap.bind(this));

        this._router.get(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}/`, this._globalConfigSet_get.bind(this));
        this._router.post(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}/`, this._globalConfigSet_setValues.bind(this));
    }

    get Router(): express.Router {
        return this._router;
    }

    private async _authenticationMiddleware(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) {
        const authorizationHeader = req.headers["authorization"];

        if (!authorizationHeader) return res.sendStatus(401);

        const bearer = authorizationHeader.trim().split(" ");
        if (bearer.length != 2) {
            return res.sendStatus(401);
        }

        const bearerToken = bearer[1];
        const callSecCtx:  CallSecurityContext | null = await this._tokenHelper.getCallSecurityContextFromAccessToken(bearerToken);

        if(!callSecCtx){
            return res.sendStatus(401);
        }

        req.securityContext = callSecCtx;
        return next();
    }

    private _handleUnauthorizedError(err: Error, res: express.Response): boolean {
        let handled = false;
        if (err instanceof UnauthorizedError) {
            this._logger.warn(err.message);
            res.status(401).json({
                status: "error",
                msg: err.message,
            });
            handled = true;
        } else if (err instanceof ForbiddenError) {
            this._logger.warn(err.message);
            res.status(403).json({
                status: "error",
                msg: err.message,
            });
            handled = true;
        }

        return handled;
    }

    /**
     * handlers - per BC config sets
     * */

    private async _bcConfigSet_postBootstrap(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const data: BoundedContextConfigurationSet = req.body;

        await this._agg.processCreateBoundedContextConfigSetCmd(req.securityContext!, data).then((success) => {
            res.status(200).json({status: "ok"});
        }).catch((error: Error) => {
            if (this._handleUnauthorizedError(error, res)) return;

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
                this._logger.error(error);

                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }

    private async _bcConfigSet_getAll(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        // validate
          try {
            const retBoundedContextConfigSets: BoundedContextConfigurationSet[] = await this._agg.getAllBoundedContextConfigSets(req.securityContext!);
            if (!retBoundedContextConfigSets) {
                this._logger.debug("no BC configuration sets found on _bcConfigSet_getAll");
                res.sendStatus(404);
                return;
            }
            res.status(200).json(retBoundedContextConfigSets);
        }catch(error: any){
            if (this._handleUnauthorizedError(error, res)) return;

            this._logger.error(error);

            res.status(500).json({
                status: "error",
                msg: "unknown error"
            });
        }
    }

    private async _bcConfigSet_getByBC(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const ownerBcParam = req.params["bc"] ?? null;
        // optional query param
        const versionParam = req.query["version"]?.toString() ?? null;

        // validate
        if (!ownerBcParam || ownerBcParam==="") {
            this._logger.warn("Invalid BC configuration set request received");
            res.sendStatus(400);
            return;
        }

        let retBoundedContextConfigSet: BoundedContextConfigurationSet | null;

        try {
            if (!versionParam) {
                retBoundedContextConfigSet = await this._agg.getLatestBoundedContextConfigSet(req.securityContext!, ownerBcParam);
            } else {
                retBoundedContextConfigSet = await this._agg.getBoundedContextConfigSetVersion(req.securityContext!, ownerBcParam, versionParam);
            }

            if (!retBoundedContextConfigSet) {
                this._logger.debug("bc configuration set not found on _bcConfigSet_getByBC");
                res.sendStatus(404);
                return;
            }
            res.status(200).json(retBoundedContextConfigSet);
            return;
        }catch(error: any){
            if (this._handleUnauthorizedError(error, res)) return;

            this._logger.error(error);

            res.status(500).json({
                status: "error",
                msg: "unknown error"
            });
        }
    }

    private async _bcConfigSet_setValues(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const ownerBcParam = req.params["bc"] ?? null;


        // optional query param
        //const versionParam = req.query["version"]?.toString() ?? null;

        // validate owner, BC and version
        if (!ownerBcParam ) {
            res.status(400).json({
                status: "error",
                msg: "invalid request"
            });
            return;
        }

        const cmdPayload: BoundedContextConfigSetChangeValuesCmdPayload = {
            boundedContextName: ownerBcParam,
            schemaVersion: req.body.schemaVersion,
            iterationNumber: req.body.iterationNumber,
            newValues: req.body.newValues
        };

        await this._agg.processChangeBoundedContextConfigSetValuesCmd(req.securityContext!, cmdPayload).then(()=>{
            return res.status(200).send({status: "ok"});
        }).catch((error: Error) => {
            if (this._handleUnauthorizedError(error, res)) return;

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
                this._logger.error(error);

                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }


    /**
     * handlers - global config sets
     * */

   /* private async _globalConfigSet_postBootstrap(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const data: GlobalConfigurationSet = req.body;

        await this._agg.processCreateGlobalConfigSetCmd(req.securityContext!, data).then(() => {
            res.status(200).json({status: "ok"});
        }).catch((error: Error) => {
            if (this._handleUnauthorizedError(error, res)) return;

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
                this._logger.error(error);

                res.status(500).json({
                    status: "error",
                    msg: "unknown error" + (error.message ? " - " + error.message : "")
                });
            }
        });
    }*/

    private async _globalConfigSet_get(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {

        // optional query param
        const versionParam = req.query["version"]?.toString() ?? null;
        const latestParam = req.query["latest"]?.toString() ?? null;

        // validate

        try {
            let retGlobalConfigSets: GlobalConfigurationSet[] = [];

            if (latestParam !== null) {
                const item = await this._agg.getLatestGlobalConfigSet(req.securityContext!);
                if (item) retGlobalConfigSets.push(item);
            } else if (versionParam) {
                const item = await this._agg.getGlobalConfigSetVersion(req.securityContext!, versionParam);
                if (item) retGlobalConfigSets.push(item);
            } else {
                retGlobalConfigSets = await this._agg.getAllGlobalConfigSets(req.securityContext!);
            }

            if (retGlobalConfigSets.length <= 0) {
                this._logger.debug("global configset not found on _globalConfigSet_get");
                res.sendStatus(404);
                return;
            }
            res.status(200).json(retGlobalConfigSets);
            return;
        }catch(error: any){
            if (this._handleUnauthorizedError(error, res)) return;

            this._logger.error(error);

            res.status(500).json({
                status: "error",
                msg: "unknown error"
            });
        }
    }

    private async _globalConfigSet_setValues(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void>{
        const cmdPayload: GlobalConfigSetChangeValuesCmdPayload = {
            schemaVersion: req.body.schemaVersion,
            iterationNumber: req.body.iterationNumber,
            newValues: req.body.newValues
        };

        await this._agg.processChangeGlobalConfigSetValuesCmd(req.securityContext!,cmdPayload).then(()=>{
            return res.status(200).send({status: "ok"});
        }).catch((error:Error) => {
            if (this._handleUnauthorizedError(error, res)) return;

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
                this._logger.error(error);

                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    }


}
