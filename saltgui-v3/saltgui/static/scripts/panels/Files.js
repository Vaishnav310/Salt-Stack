/* IDE-like File Explorer and Editor
   - Recursive file tree (VS Code style)
   - Code editor with line numbers and theme
   - Create/Edit/Save functionality
   - Completely independent of Salt API
*/

export class FilesPanel {
  constructor() {
    this.div = document.createElement("div");
    this.div.className = "panel files-panel";
    this.currentPath = "/srv/salt"; // Folder currently selected for new items
    this.openFile = null;           // File currently open in editor
    this.backendPort = 8000;
    this.initUI();
  }

  async onShow() {
    const lastRoot = localStorage.getItem("explorer_last_root") || "/srv/salt";
    this.loadFolder(lastRoot, this.div.querySelector("#file-tree"));
    this.updateActiveRoot(lastRoot);
  }

  updateActiveRoot(path) {
    this.div.querySelectorAll(".btn-root").forEach(btn => btn.classList.remove("active"));
    if (path.includes("salt")) this.div.querySelector("#root-salt").classList.add("active");
    if (path.includes("pillar")) this.div.querySelector("#root-pillar").classList.add("active");
  }

  clearPanel() {
    this.div.innerHTML = "";
    this.initUI();
  }

  getBackendUrl(cmd, params = {}) {
    const host = localStorage.getItem("explorer_host") || window.location.hostname;
    const url = new URL(`http://${host}:${this.backendPort}${cmd}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    return url.toString();
  }

  async apiPost(cmd, data) {
    const host = localStorage.getItem("explorer_host") || window.location.hostname;
    const url = `http://${host}:${this.backendPort}${cmd}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Action failed");
    }
    return await response.json();
  }

  initUI() {
    this.div.innerHTML = `
      <div class="file-explorer">
          <div class="file-explorer-sidebar">
              <div class="file-tree-header">
                EXPLORER
                <div class="sidebar-actions">
                    <span class="action-icon" title="New File" id="action-new-file"></span>
                    <span class="action-icon" title="New Folder" id="action-new-folder"></span>
                    <span class="action-icon" title="Refresh" id="action-refresh"></span>
                </div>
              </div>
              <div class="sidebar-roots">
                  <button class="btn-root active" id="root-salt">
                      <span class="root-icon icon-salt"></span>
                      <span class="root-text">Salt States</span>
                  </button>
                  <button class="btn-root" id="root-pillar">
                      <span class="root-icon icon-pillar"></span>
                      <span class="root-text">Pillar Data</span>
                  </button>
              </div>
              <div class="file-tree" id="file-tree"></div>
          </div>
          <div class="file-explorer-content">
              <div class="editor-toolbar">
                  <div class="editor-tabs" id="editor-tabs">
                    <div class="tab active" id="current-tab">No file open</div>
                  </div>
                  <button class="btn-ide" id="btn-save" disabled>Save Changes</button>
              </div>
              <div class="editor-container">
                  <div class="line-numbers" id="line-numbers">1</div>
                  <div style="position:relative; flex:1; display:flex;">
                      <pre class="syntax-highlight" id="syntax-highlight"></pre>
                      <textarea class="code-editor" id="code-editor" spellcheck="false" wrap="off"></textarea>
                  </div>
              </div>
          </div>
      </div>
    `;

    const editor = this.div.querySelector("#code-editor");
    editor.addEventListener("input", () => {
        this.updateLineNumbers();
        this.highlightSyntax();
    });
    editor.addEventListener("scroll", () => {
        this.div.querySelector("#line-numbers").scrollTop = editor.scrollTop;
        this.div.querySelector("#syntax-highlight").scrollTop = editor.scrollTop;
        this.div.querySelector("#syntax-highlight").scrollLeft = editor.scrollLeft;
    });
    
    // Tab key support in textarea
    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + "    " + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
            this.updateLineNumbers();
        }
    });

    this.div.querySelector("#btn-save").addEventListener("click", () => this.saveFile());

    this.div.querySelector("#root-salt").addEventListener("click", () => {
        this.currentPath = "/srv/salt";
        localStorage.setItem("explorer_last_root", "/srv/salt");
        this.updateActiveRoot("/srv/salt");
        this.loadFolder("/srv/salt", this.div.querySelector("#file-tree"));
    });
    this.div.querySelector("#root-pillar").addEventListener("click", () => {
        this.currentPath = "/srv/pillar";
        localStorage.setItem("explorer_last_root", "/srv/pillar");
        this.updateActiveRoot("/srv/pillar");
        this.loadFolder("/srv/pillar", this.div.querySelector("#file-tree"));
    });
    
    this.div.querySelector("#action-refresh").addEventListener("click", () => this.onShow());
    this.div.querySelector("#action-new-file").addEventListener("click", () => this.promptNewItem('file'));
    this.div.querySelector("#action-new-folder").addEventListener("click", () => this.promptNewItem('folder'));
  }

  updateLineNumbers() {
      const editor = this.div.querySelector("#code-editor");
      const lineNumbers = this.div.querySelector("#line-numbers");
      const lines = editor.value.split("\n").length;
      lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join("<br>");
      this.div.querySelector("#btn-save").disabled = false;
  }

  highlightSyntax() {
      const editor = this.div.querySelector("#code-editor");
      const highlight = this.div.querySelector("#syntax-highlight");
      let code = editor.value;

      // Basic regex highlighting for YAML/SLS/JSON
      code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      // Strings in quotes
      code = code.replace(/("[^"]*")/g, '<span class="hl-string">$1</span>');
      code = code.replace(/('[^']*')/g, '<span class="hl-string">$1</span>');
      
      // Keys (text followed by colon)
      code = code.replace(/([\w-]+)\s*:/g, '<span class="hl-key">$1</span>:');
      
      // Numbers
      code = code.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hl-number">$1</span>');
      
      // Comments
      code = code.replace(/(#.*)/g, '<span class="hl-comment">$1</span>');

      highlight.innerHTML = code + "\n";
  }

  async loadFolder(path, container) {
    container.innerHTML = `<div style="padding:5px 15px; font-size:12px; color:#666;">Loading...</div>`;
    const url = this.getBackendUrl('/list', { path });
    
    try {
      // Add a timeout to the fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Server error");
      }
      
      const files = await response.json();
      
      container.innerHTML = "";
      // Folders first, then files
      files.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
      
      if (files.length === 0) {
          container.innerHTML = `<div style="padding:5px 15px; font-size:12px; color:#666;">(empty)</div>`;
          return;
      }

      files.forEach(file => {
          const item = document.createElement("div");
          item.className = `file-item ${file.isDir ? 'directory' : ''}`;
          item.setAttribute("data-name", file.name);
          item.innerHTML = `<span class="file-icon">${file.isDir ? '📁' : '📄'}</span> ${file.name}`;
          
          const childContainer = document.createElement("div");
          childContainer.className = "folder-content";
          
          item.onclick = (e) => {
              e.stopPropagation();
              this.div.querySelectorAll(".file-item").forEach(el => el.classList.remove("active"));
              item.classList.add("active");
              this.currentPath = file.isDir ? file.path : path;

              if (file.isDir) {
                  item.classList.toggle("expanded");
                  childContainer.classList.toggle("show");
                  if (childContainer.classList.contains("show") && !childContainer.innerHTML) {
                      this.loadFolder(file.path, childContainer);
                  }
              } else {
                  this.openFileContent(file.path, file.name);
              }
          };
          
          container.appendChild(item);
          if (file.isDir) container.appendChild(childContainer);
      });
    } catch (err) {
      const msg = err.name === 'AbortError' ? "Connection Timeout" : err.message;
      container.innerHTML = `
        <div style="color:#ef4444; padding:5px 15px; font-size:11px;">
            <b>Error:</b> ${msg}<br>
            <span style="color:#666; font-size:9px; cursor:pointer;" onclick="alert('${url}')">Show URL</span>
        </div>`;
    }
  }

  async openFileContent(path, name) {
      this.openFile = path;
      const editor = this.div.querySelector("#code-editor");
      const tab = this.div.querySelector("#current-tab");
      const saveBtn = this.div.querySelector("#btn-save");
      
      tab.innerText = name;
      editor.value = "Loading...";
      
      try {
          const response = await fetch(this.getBackendUrl('/read', { path }));
          const data = await response.json();
          editor.value = data.content || "";
          this.updateLineNumbers();
          this.highlightSyntax();
          saveBtn.disabled = true;
          saveBtn.innerText = "Save Changes";
      } catch (err) {
          editor.value = "Error loading file: " + err.message;
      }
  }

  async saveFile() {
      if (!this.openFile) return;
      const editor = this.div.querySelector("#code-editor");
      const saveBtn = this.div.querySelector("#btn-save");
      
      saveBtn.innerText = "Saving...";
      saveBtn.disabled = true;
      
      try {
          await this.apiPost('/save', { path: this.openFile, content: editor.value });
          saveBtn.innerText = "Saved!";
          setTimeout(() => {
              saveBtn.innerText = "Save Changes";
          }, 2000);
      } catch (err) {
          alert("Failed to save: " + err.message);
          saveBtn.innerText = "Error!";
          saveBtn.disabled = false;
      }
  }

  promptNewItem(type) {
      const name = prompt(`Enter new ${type} name in: ${this.currentPath}`);
      if (!name) return;
      
      const path = (this.currentPath.endsWith('/') ? this.currentPath : this.currentPath + '/') + name;
      const cmd = type === 'file' ? '/create_file' : '/create_dir';
      
      this.apiPost(cmd, { path })
        .then(() => {
            // Refresh folder list (brute force refresh for now)
            this.onShow();
        })
        .catch(err => alert("Error creating " + type + ": " + err.message));
  }
}
