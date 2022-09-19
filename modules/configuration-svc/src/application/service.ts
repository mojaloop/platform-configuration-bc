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

"use strict"
import {existsSync} from "fs"
import {Server} from "http";
import express from "express";
import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import {FileConfigSetRepo} from "../infrastructure/file_configset_repo";
import {
    ConfigSetAggregate,
    IAppConfigSetRepository,
    IGlobalConfigSetRepository
} from "@mojaloop/platform-configuration-bc-domain-lib";
import {
    AuditClient,
    KafkaAuditClientDispatcher,
    LocalAuditClientCryptoProvider
} from "@mojaloop/auditing-bc-client-lib";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {AppConfigsRoutes} from "./appconfigs_routes";
import {GlobalConfigsRoutes} from "./globalconfigs_routes";

const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;
const LOGLEVEL:LogLevel = process.env["LOG_LEVEL"] as LogLevel || LogLevel.DEBUG;

const BC_NAME = "platform-configuration-bc";
const APP_NAME = "configuration-svc";
const APP_VERSION = "0.0.1";

const SVC_DEFAULT_HTTP_PORT = 3100;

const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const KAFKA_AUDITS_TOPIC = process.env["KAFKA_AUDITS_TOPIC"] || "audits";
const KAFKA_LOGS_TOPIC = process.env["KAFKA_LOGS_TOPIC"] || "logs";
const AUDIT_CERT_FILE_PATH = process.env["AUDIT_CERT_FILE_PATH"] || "./dist/tmp_key_file";

const GLOBALCONFIGSET_URL_RESOURCE_NAME = "globalConfigSets";
const APPCONFIGSET_URL_RESOURCE_NAME = "appConfigSets";

const kafkaProducerOptions = {
    kafkaBrokerList: KAFKA_URL
}


// only the vars required outside the start fn
let logger:ILogger;
let expressServer: Server;

function setupExpress(configSetAgg:ConfigSetAggregate, loggerParam:ILogger): express.Express {
    const app = express();
    app.use(express.json()); // for parsing application/json
    app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded

    const globalConfigsRoutes = new GlobalConfigsRoutes(configSetAgg, loggerParam);
    const appConfigsRoutes = new AppConfigsRoutes(configSetAgg, loggerParam);

    app.use(`/${GLOBALCONFIGSET_URL_RESOURCE_NAME}`, globalConfigsRoutes.Router);
    app.use(`/${APPCONFIGSET_URL_RESOURCE_NAME}`, appConfigsRoutes.Router);

    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        // catch all
        res.sendStatus(404);
    });

    return app;
}


export async function start(
        loggerParam?:ILogger,
        auditClient?:IAuditClient,
        appConfigRepo?:IAppConfigSetRepository,
        globalConfigRepo?:IGlobalConfigSetRepository):Promise<void> {

    if(!loggerParam) {
        logger = new KafkaLogger(
                BC_NAME,
                APP_NAME,
                APP_VERSION,
                kafkaProducerOptions,
                KAFKA_LOGS_TOPIC,
                LOGLEVEL
        );
        await (logger as KafkaLogger).start();
    }else{
        logger = loggerParam;
    }

    if(!auditClient) {
        if (!existsSync(AUDIT_CERT_FILE_PATH)) {
            if (PRODUCTION_MODE) process.exit(9);

            // create e tmp file
            LocalAuditClientCryptoProvider.createRsaPrivateKeyFileSync(AUDIT_CERT_FILE_PATH, 2048);
        }

        const cryptoProvider = new LocalAuditClientCryptoProvider(AUDIT_CERT_FILE_PATH);
        const auditDispatcher = new KafkaAuditClientDispatcher(kafkaProducerOptions, KAFKA_AUDITS_TOPIC, logger);
        // NOTE: to pass the same kafka logger to the audit client, make sure the logger is started/initialised already
        auditClient = new AuditClient(BC_NAME, APP_NAME, APP_VERSION, cryptoProvider, auditDispatcher);

        await auditClient.init();
    }

    let configSetAgg: ConfigSetAggregate;
    if(!appConfigRepo || ! globalConfigRepo){
        let repo: any;
        repo =  new FileConfigSetRepo("./dist/configSetRepoTempStorageFile.json", logger);
        await repo.init();
        configSetAgg = new ConfigSetAggregate(repo, repo, logger, auditClient);
    }else{
        configSetAgg = new ConfigSetAggregate(appConfigRepo, globalConfigRepo, logger, auditClient);
    }

    const app = setupExpress(configSetAgg, logger);

    let portNum = SVC_DEFAULT_HTTP_PORT;
    if(process.env["SVC_HTTP_PORT"] && !isNaN(parseInt(process.env["SVC_HTTP_PORT"]))) {
        portNum = parseInt(process.env["SVC_HTTP_PORT"])
    }

    expressServer = app.listen(portNum, () => {
        console.log(`🚀 Server ready at: http://localhost:${portNum}`);
        logger!.info("Platform configuration service started");
    });
}

export function stop(){
    expressServer.close();
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
