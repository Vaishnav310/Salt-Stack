/* global */

import {MinionManagementPanel} from "../panels/MinionManagement.js";
import {Page} from "./Page.js";

export class MinionManagementPage extends Page {

  constructor (pRouter) {
    super("minionmanagement", "Minion Management", "page-minion-management", "button-minionmanagement", pRouter);

    this.management = new MinionManagementPanel();
    super.addPanel(this.management);
  }

  handleSaltJobRetEvent (pData) {
    // optional: could show live updates here
  }
}
