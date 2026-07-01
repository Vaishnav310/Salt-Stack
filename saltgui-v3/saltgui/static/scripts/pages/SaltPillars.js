import {SaltPillarsPanel} from "../panels/SaltPillars.js";
import {Page} from "./Page.js";

export class SaltPillarsPage extends Page {

  constructor (pRouter) {
    super("salt-pillars", "Salt Pillars", "page-salt-pillars", "button-salt-pillars", pRouter);

    this.saltpillars = new SaltPillarsPanel();
    super.addPanel(this.saltpillars);
  }

  handleSaltJobRetEvent (pData) {
    // pillars doesn't need to handle job events currently
  }
}
