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


import {PlatformConfigurationPrivileges} from "@mojaloop/platform-configuration-bc-domain-lib";

export const PrivilegesDefinition = [
    {
        privId: PlatformConfigurationPrivileges.VIEW_GLOBAL,
        labelName: "View Global Configurations",
        description: "Allows for the retrieval of Global Configurations Sets"
    }, {
        privId: PlatformConfigurationPrivileges.BOOSTRAP_GLOBAL,
        labelName: "Bootstrap Global Configurations",
        description: "Allows bootstraping new schema versions of the Global Configurations Set"
    }, {
        privId: PlatformConfigurationPrivileges.CHANGE_VALUES_GLOBAL,
        labelName: "Change Global Configurations Values",
        description: "Allows changing Global Configurations Set values"
    },{
        privId: PlatformConfigurationPrivileges.VIEW_BOUNDED_CONTEXT,
        labelName: "View Bounded Context Configurations",
        description: "Allows for the retrieval of Bounded Context Configurations Sets"
    },{
        privId: PlatformConfigurationPrivileges.VIEW_ALL_BOUNDED_CONTEXT,
        labelName: "View All Bounded Context Configurations",
        description: "Allows for the retrieval of all Bounded Context Configurations Sets"
    }, {
        privId: PlatformConfigurationPrivileges.BOOSTRAP_BOUNDED_CONTEXT,
        labelName: "Bootstrap Global Configurations",
        description: "Allows bootstraping new schema versions of the Bounded Context's Configurations Sets"
    }, {
        privId: PlatformConfigurationPrivileges.CHANGE_VALUES_BOUNDED_CONTEXT,
        labelName: "Change Bounded Context Configurations Values",
        description: "Allows changing Bounded Context Set values"
    },

];

