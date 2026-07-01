/* global */

import {DashboardPanel} from "../panels/Dashboard.js";
import {Page} from "./Page.js";

export class DashboardPage extends Page {

  constructor (pRouter) {
    super("dashboard", "Dashboard", "page-dashboard", "button-dashboard", pRouter);

    this.dashboard = new DashboardPanel();
    super.addPanel(this.dashboard);
  }

  handleSaltJobRetEvent (pData) {
    // dashboard doesn't need to handle job events
  }
}
