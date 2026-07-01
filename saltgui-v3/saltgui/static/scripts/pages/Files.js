/* global */

import {FilesPanel} from "../panels/Files.js";
import {Page} from "./Page.js";

export class FilesPage extends Page {

  constructor (pRouter) {
    super("files", "Files", "page-files", "button-files", pRouter);

    this.files = new FilesPanel();
    super.addPanel(this.files);
  }

  handleSaltJobRetEvent (pData) {
    // files page handles its own updates
  }
}
