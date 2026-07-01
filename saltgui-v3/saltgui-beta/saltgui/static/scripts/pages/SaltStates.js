import {SaltStatesPanel} from "../panels/SaltStates.js";
import {Page} from "./Page.js";

export class SaltStatesPage extends Page {

  constructor (pRouter) {
    super("salt-states", "Salt States", "page-salt-states", "button-salt-states", pRouter);

    this.saltstates = new SaltStatesPanel();
    super.addPanel(this.saltstates);
  }

  handleSaltJobRetEvent (pData) {
    // state management doesn't need to handle job events currently
  }
}
