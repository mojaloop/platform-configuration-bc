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
import {existsSync} from "fs"
import express, {Express} from "express";
import {LogLevel, ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import {ConfigurationSet} from "@mojaloop/platform-configuration-bc-types-lib";
import {FileConfigSetRepo} from "../infrastructure/file_configset_repo";
import {ConfigSetAggregate} from "../domain/configset_agg";

import {
    CannotCreateDuplicateConfigSetError,
    CannotCreateOverridePreviousVersionConfigSetError,
    ConfigurationSetNotFoundError, CouldNotStoreConfigSetError, InvalidConfigurationSetError, ParameterNotFoundError
} from "../domain/errors";
import {ConfigSetChangeValuesCmdPayload} from "../domain/commands";
import {
    AuditClient,
    KafkaAuditClientDispatcher,
    LocalAuditClientCryptoProvider
} from "@mojaloop/auditing-bc-client-lib";

const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;

const BC_NAME = "platform-configuration-bc";
const APP_NAME = "platform-configuration-svc";
const APP_VERSION = "0.0.1";
const LOGLEVEL = LogLevel.DEBUG;

const SVC_DEFAULT_HTTP_PORT = 3100;

const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const KAFKA_AUDITS_TOPIC = process.env["KAFKA_AUDITS_TOPIC"] || "audits";
const KAFKA_LOGS_TOPIC = process.env["KAFKA_LOGS_TOPIC"] || "logs";
const AUDIT_CERT_FILE_PATH = process.env["AUDIT_CERT_FILE_PATH"] || "./tmp_key_file";

let app:Express;
let auditClient:AuditClient;
let configSetAgg:ConfigSetAggregate;

//const logger: ILogger = new ConsoleLogger();
// kafka logger

const kafkaProducerOptions = {
    kafkaBrokerList: KAFKA_URL
}
//const consoleLogger:ConsoleLogger = new ConsoleLogger();

const logger:KafkaLogger = new KafkaLogger(
        BC_NAME,
        APP_NAME,
        APP_VERSION,
        kafkaProducerOptions,
        KAFKA_LOGS_TOPIC,
        LOGLEVEL
);

function setupExpress() {
    app.use(express.json()); // for parsing application/json
    app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded
}

function setupRoutes() {

    app.post("/bootstrap", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const data: ConfigurationSet = req.body;
        logger.debug(data);

        await configSetAgg.processCreateConfigSetCmd(data).then((success) => {
            res.status(200).json({status: "ok"});
        }).catch((error: Error) => {
            if (error instanceof CannotCreateDuplicateConfigSetError) {
                res.status(409).json({
                    status: "error",
                    msg: "received duplicated configuration, cannot update"
                });
            } else if (error instanceof CannotCreateOverridePreviousVersionConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "received configuration has lower id than latest available, cannot update"
                });
            } else if (error instanceof InvalidConfigurationSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "invalid configuration set"
                });
            } else {
                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });
    });

    app.get("/configsets/", async (req: express.Request, res: express.Response, next: express.NextFunction) => {

        const retConfigSets: ConfigurationSet[] = await configSetAgg.getAllConfigSets();

        if (!retConfigSets) {
            logger.debug("no config sets found");
            return res.status(404).send();
        }
        return res.status(200).json(retConfigSets);
    });

    app.get("/configsets/:env/:bc/:app", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const envParam = req.params["env"] ?? null;
        const ownerBcParam = req.params["bc"] ?? null;
        const ownerAppParam = req.params["app"] ?? null;
        // optional query param
        const versionParam = req.query["version"]?.toString() ?? null;

        // validate
        if (!envParam || envParam==="" || !ownerBcParam || ownerBcParam==="" || !ownerAppParam || ownerAppParam==="") {
            logger.warn("Invalid configset request received");
            return res.status(400).send();
        }

        let retConfigSet: ConfigurationSet | null;

        if (!versionParam) {
            retConfigSet = await configSetAgg.getLatestVersion(envParam, ownerBcParam, ownerAppParam);
        } else {
            retConfigSet = await configSetAgg.getSpecificVersion(envParam, ownerBcParam, ownerAppParam, versionParam);
        }

        if (!retConfigSet) {
            logger.debug("configset not found");
            return res.status(404).send();
        }
        return res.status(200).json(retConfigSet);
    });

    app.post("/configsets/:env/:bc/:app/setvalues", async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<any> => {
        const envParam = req.params["env"] ?? null;
        const ownerBcParam = req.params["bc"] ?? null;
        const ownerAppParam = req.params["app"] ?? null;

        // optional query param
        const versionParam = req.query["version"]?.toString() ?? null;


        let invalidReq = false;
        // validate owner, app and version
        if (!envParam || envParam==="" || !ownerBcParam || ownerBcParam==="" || !ownerAppParam || ownerAppParam==="") {
            invalidReq = true;
        }

        const cmdPayload: ConfigSetChangeValuesCmdPayload = {
            environmentName: envParam,
            boundedContextName: ownerBcParam,
            applicationName: ownerAppParam,
            version: null, // disallow updates to older versions for now
            newValues: req.body
        };


        await configSetAgg.processChangeValuesCmd(cmdPayload).then(()=>{
            return res.status(200).send({status: "ok"});
        }).catch(error => {
            // TODO should return multiple errors
            if (error instanceof ConfigurationSetNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "configuration set not found"
                });
            }else if (error instanceof ParameterNotFoundError) {
                res.status(404).json({
                    status: "error",
                    msg: "parameter set not found"
                });
            }else if (error instanceof CouldNotStoreConfigSetError) {
                res.status(400).json({
                    status: "error",
                    msg: "Not able to store configuration set"
                });
            }else{
                res.status(500).json({
                    status: "error",
                    msg: "unknown error"
                });
            }
        });

    });

    app.use((req, res) => {
        // catch all
        res.send(404);
    })
}

async function start():Promise<void> {
    await logger.start();

    if(!existsSync(AUDIT_CERT_FILE_PATH)) {
        if(PRODUCTION_MODE) process.exit(9);

        // create e tmp file
        LocalAuditClientCryptoProvider.createRsaPrivateKeyFileSync(AUDIT_CERT_FILE_PATH, 2048);
    }

    const cryptoProvider = new LocalAuditClientCryptoProvider(AUDIT_CERT_FILE_PATH);
    const auditDispatcher = new KafkaAuditClientDispatcher(kafkaProducerOptions, KAFKA_AUDITS_TOPIC, logger);
    // NOTE: to pass the same kafka logger to the audit client, make sure the logger is started/initialised already
    auditClient = new AuditClient(BC_NAME, APP_NAME, APP_VERSION, cryptoProvider, auditDispatcher);

    const repo: FileConfigSetRepo = new FileConfigSetRepo("./dist/configSetRepoTempStorageFile.json", logger);
    configSetAgg = new ConfigSetAggregate(repo, logger, auditClient);

    app = express();

    await logger.start();
    await auditClient.init();
    await repo.init();

    setupExpress();
    setupRoutes();

    let portNum = SVC_DEFAULT_HTTP_PORT;
    if(process.env["SVC_HTTP_PORT"] && !isNaN(parseInt(process.env["SVC_HTTP_PORT"]))) {
        portNum = parseInt(process.env["SVC_HTTP_PORT"])
    }

    const server = app.listen(portNum, () => {
        console.log(`🚀 Server ready at: http://localhost:${portNum}`);
        logger.info("Platform configuration service started");
    });
}

async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
    logger.info(`Service - ${signal} received - cleaning up...`);
    process.exit();
}

//catches ctrl+c event
process.on("SIGINT", _handle_int_and_term_signals.bind(this));

//catches program termination event
process.on("SIGTERM", _handle_int_and_term_signals.bind(this));

//do something when app is closing
process.on('exit', () => {
    logger.info("Microservice - exiting...");
});

start();
