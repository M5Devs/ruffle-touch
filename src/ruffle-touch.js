/**
 * RuffleTouch - On-screen Touch Gamepad Overlay for Ruffle Web Player
 */

class RuffleTouch {
    /**
     * @param {Object} options Configuration options
     * @param {HTMLElement|string} [options.container] Parent container element where controls overlay will be attached (defaults to document.body)
     * @param {HTMLElement|Window} [options.target] Target element to receive keyboard events (defaults to window)
     * @param {HTMLElement} [options.player] Ruffle player instance reference
     * @param {boolean} [options.visible=true] Initial visibility state of controls
     */
    constructor(options = {}) {
        if (typeof options === 'string') {
            options = { container: options };
        }

        this.container = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : (options.container || document.body);

        this.player = options.player || null;
        this.target = options.target || this.player || window;
        this.visible = options.visible !== undefined ? Boolean(options.visible) : true;

        this.overlayElement = null;
        this.toolbarElement = null;
        this.toggleBtn = null;
        this.settingsBtn = null;
        this.drawerElement = null;
        this.drawerBackdrop = null;
        this.activeKeys = new Map();

        this.settings = this.loadSettings();

        this.keyDefinitions = {
            'up': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, label: '▲' },
            'down': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, label: '▼' },
            'left': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, label: '◀' },
            'right': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, label: '▶' },
            'space': { key: ' ', code: 'Space', keyCode: 32, label: 'SPACE' },
            'enter': { key: 'Enter', code: 'Enter', keyCode: 13, label: 'ENTER' },
            'z': { key: 'z', code: 'KeyZ', keyCode: 90, label: 'Z' },
            'x': { key: 'x', code: 'KeyX', keyCode: 88, label: 'X' }
        };

        this.init();
        this.attachBackgroundTouchTrap();
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        const defaults = {
            opacity: 1.0,
            scale: 1.0,
            haptic: true
        };
        try {
            const saved = localStorage.getItem('ruffle_touch_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...defaults, ...parsed };
            }
        } catch (err) {
            console.warn('RuffleTouch: Failed to load settings from localStorage', err);
        }
        return defaults;
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('ruffle_touch_settings', JSON.stringify(this.settings));
        } catch (err) {
            console.warn('RuffleTouch: Failed to save settings to localStorage', err);
        }
    }

    /**
     * Apply UI customization settings (opacity and scale)
     */
    applySettings() {
        if (!this.overlayElement) return;

        if (this.visible) {
            this.overlayElement.style.opacity = this.settings.opacity;
        }

        const dpad = this.overlayElement.querySelector('.ruffle-touch-dpad');
        const actions = this.overlayElement.querySelector('.ruffle-touch-actions');

        if (dpad) {
            dpad.style.transform = `scale(${this.settings.scale})`;
            dpad.style.transformOrigin = 'bottom left';
        }
        if (actions) {
            actions.style.transform = `scale(${this.settings.scale})`;
            actions.style.transformOrigin = 'bottom right';
        }
    }

    /**
     * Trigger haptic feedback vibration if enabled
     */
    triggerHaptic() {
        if (this.settings.haptic && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
                navigator.vibrate(25);
            } catch (err) {
                // Ignore vibration errors
            }
        }
    }

    /**
     * Set or update the target element for keyboard events
     * @param {HTMLElement|Window} target
     */
    setTarget(target) {
        this.target = target || window;
    }

    /**
     * Set or update the Ruffle player instance
     * @param {HTMLElement} player
     */
    setPlayer(player) {
        this.player = player;
        if (player && !this.target) {
            this.target = player;
        }
    }

    /**
     * Focus Ruffle player instance if set and available
     */
    focusPlayer() {
        if (this.player && typeof this.player.focus === 'function') {
            try {
                this.player.focus();
            } catch (err) {
                // Ignore focus errors if player is unmounted
            }
        }
    }

    /**
     * Attach background/edge touch & click listeners for focus lock
     */
    attachBackgroundTouchTrap() {
        const handleTrap = (e) => {
            // Check if touch/click was directly on a button, input, label, or inside settings drawer
            if (e.target && e.target.closest && e.target.closest('button, input, label, .ruffle-touch-drawer, .ruffle-touch-toolbar')) {
                return;
            }
            this.focusPlayer();
        };

        const targetElements = [document.body, this.container];
        targetElements.forEach((el) => {
            if (el) {
                el.addEventListener('pointerdown', handleTrap, { passive: true });
                el.addEventListener('click', handleTrap, { passive: true });
            }
        });
    }

    /**
     * Build the UI overlay DOM structure
     */
    init() {
        if (!this.container) {
            console.error('RuffleTouch: Container element not found.');
            return;
        }

        // Toolbar Container (Top Right Corner)
        this.toolbarElement = document.createElement('div');
        this.toolbarElement.className = 'ruffle-touch-toolbar';

        // Settings Button (⚙️)
        this.settingsBtn = document.createElement('button');
        this.settingsBtn.className = 'ruffle-touch-toolbar-btn ruffle-touch-settings-toggle';
        this.settingsBtn.setAttribute('aria-label', 'Open Gamepad Settings');
        this.settingsBtn.type = 'button';
        this.settingsBtn.innerHTML = '⚙️';
        this.settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleSettingsDrawer();
        });

        // Gamepad Toggle Button (🎮)
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.className = 'ruffle-touch-toolbar-btn ruffle-touch-toggle';
        this.toggleBtn.setAttribute('aria-label', 'Toggle Gamepad Controls');
        this.toggleBtn.type = 'button';
        this.toggleBtn.innerHTML = '🎮';
        this.toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleVisibility();
            this.focusPlayer();
        });

        this.toolbarElement.appendChild(this.settingsBtn);
        this.toolbarElement.appendChild(this.toggleBtn);

        // Overlay Main Wrapper
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'ruffle-touch-overlay';
        if (!this.visible) {
            this.overlayElement.classList.add('ruffle-touch-hidden');
        }

        // D-Pad (Bottom-Left)
        const dpadContainer = document.createElement('div');
        dpadContainer.className = 'ruffle-touch-dpad';

        const dpadUp = this.createButton('up', 'ruffle-touch-btn dpad-up');
        const dpadDown = this.createButton('down', 'ruffle-touch-btn dpad-down');
        const dpadLeft = this.createButton('left', 'ruffle-touch-btn dpad-left');
        const dpadRight = this.createButton('right', 'ruffle-touch-btn dpad-right');
        const dpadCenter = document.createElement('div');
        dpadCenter.className = 'dpad-center';

        dpadContainer.appendChild(dpadUp);
        dpadContainer.appendChild(dpadDown);
        dpadContainer.appendChild(dpadLeft);
        dpadContainer.appendChild(dpadRight);
        dpadContainer.appendChild(dpadCenter);

        // Action Buttons (Bottom-Right)
        const actionContainer = document.createElement('div');
        actionContainer.className = 'ruffle-touch-actions';

        const btnZ = this.createButton('z', 'ruffle-touch-btn action-z');
        const btnX = this.createButton('x', 'ruffle-touch-btn action-x');
        const btnSpace = this.createButton('space', 'ruffle-touch-btn action-space');
        const btnEnter = this.createButton('enter', 'ruffle-touch-btn action-enter');

        const topActions = document.createElement('div');
        topActions.className = 'action-group primary-actions';
        topActions.appendChild(btnZ);
        topActions.appendChild(btnX);

        const bottomActions = document.createElement('div');
        bottomActions.className = 'action-group secondary-actions';
        bottomActions.appendChild(btnSpace);
        bottomActions.appendChild(btnEnter);

        actionContainer.appendChild(topActions);
        actionContainer.appendChild(bottomActions);

        // Assemble overlay
        this.overlayElement.appendChild(dpadContainer);
        this.overlayElement.appendChild(actionContainer);

        // Settings Drawer & Backdrop
        this.initSettingsDrawer();

        // Mount to container
        this.container.appendChild(this.toolbarElement);
        this.container.appendChild(this.overlayElement);
        this.container.appendChild(this.drawerBackdrop);
        this.container.appendChild(this.drawerElement);

        // Apply settings styling
        this.applySettings();
    }

    /**
     * Create individual touch button with listeners
     */
    createButton(keyId, className) {
        const keyDef = this.keyDefinitions[keyId];
        const btn = document.createElement('button');
        btn.className = className;
        btn.type = 'button';
        btn.textContent = keyDef.label;
        btn.dataset.key = keyId;

        const handlePress = (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.add('active');
            this.triggerHaptic();
            this.focusPlayer();
            this.triggerKeyDown(keyId);
        };

        const handleRelease = (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.remove('active');
            this.focusPlayer();
            this.triggerKeyUp(keyId);
        };

        // Pointer events for modern touch & mouse support
        btn.addEventListener('pointerdown', handlePress);
        btn.addEventListener('pointerup', handleRelease);
        btn.addEventListener('pointercancel', handleRelease);
        btn.addEventListener('pointerleave', handleRelease);

        // Prevent context menu or text selection
        btn.addEventListener('contextmenu', (e) => e.preventDefault());

        return btn;
    }

    /**
     * Build Settings Drawer & Backdrop
     */
    initSettingsDrawer() {
        // Backdrop (tap outside to close)
        this.drawerBackdrop = document.createElement('div');
        this.drawerBackdrop.className = 'ruffle-touch-drawer-backdrop';
        this.drawerBackdrop.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeSettingsDrawer();
        });

        // Sliding Drawer Container
        this.drawerElement = document.createElement('div');
        this.drawerElement.className = 'ruffle-touch-drawer';

        // Drawer Header
        const header = document.createElement('div');
        header.className = 'ruffle-touch-drawer-header';

        const title = document.createElement('h3');
        title.innerHTML = '⚙️ Gamepad Settings';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ruffle-touch-drawer-close';
        closeBtn.innerHTML = '✕';
        closeBtn.setAttribute('aria-label', 'Close Settings');
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeSettingsDrawer();
        });

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Drawer Content
        const content = document.createElement('div');
        content.className = 'ruffle-touch-drawer-content';

        // Section 1: UI Customization
        const uiSection = document.createElement('div');
        uiSection.className = 'ruffle-touch-settings-section';

        const uiSectionTitle = document.createElement('h4');
        uiSectionTitle.textContent = 'UI Customization';
        uiSection.appendChild(uiSectionTitle);

        // Opacity Slider
        const opacityGroup = document.createElement('div');
        opacityGroup.className = 'ruffle-touch-setting-group';

        const opacityLabelRow = document.createElement('div');
        opacityLabelRow.className = 'setting-label-row';
        const opacityLabel = document.createElement('label');
        opacityLabel.textContent = 'Overlay Opacity';
        const opacityVal = document.createElement('span');
        opacityVal.className = 'setting-value';
        opacityVal.textContent = `${Math.round(this.settings.opacity * 100)}%`;
        opacityLabelRow.appendChild(opacityLabel);
        opacityLabelRow.appendChild(opacityVal);

        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.min = '0.2';
        opacitySlider.max = '1.0';
        opacitySlider.step = '0.05';
        opacitySlider.value = this.settings.opacity;
        opacitySlider.className = 'ruffle-touch-slider';
        opacitySlider.addEventListener('input', (e) => {
            this.settings.opacity = parseFloat(e.target.value);
            opacityVal.textContent = `${Math.round(this.settings.opacity * 100)}%`;
            this.applySettings();
            this.saveSettings();
        });

        opacityGroup.appendChild(opacityLabelRow);
        opacityGroup.appendChild(opacitySlider);
        uiSection.appendChild(opacityGroup);

        // Gamepad Scale Slider
        const scaleGroup = document.createElement('div');
        scaleGroup.className = 'ruffle-touch-setting-group';

        const scaleLabelRow = document.createElement('div');
        scaleLabelRow.className = 'setting-label-row';
        const scaleLabel = document.createElement('label');
        scaleLabel.textContent = 'Gamepad Size';
        const scaleVal = document.createElement('span');
        scaleVal.className = 'setting-value';
        scaleVal.textContent = `${parseFloat(this.settings.scale).toFixed(2)}x`;
        scaleLabelRow.appendChild(scaleLabel);
        scaleLabelRow.appendChild(scaleVal);

        const scaleSlider = document.createElement('input');
        scaleSlider.type = 'range';
        scaleSlider.min = '0.8';
        scaleSlider.max = '1.4';
        scaleSlider.step = '0.05';
        scaleSlider.value = this.settings.scale;
        scaleSlider.className = 'ruffle-touch-slider';
        scaleSlider.addEventListener('input', (e) => {
            this.settings.scale = parseFloat(e.target.value);
            scaleVal.textContent = `${parseFloat(this.settings.scale).toFixed(2)}x`;
            this.applySettings();
            this.saveSettings();
        });

        scaleGroup.appendChild(scaleLabelRow);
        scaleGroup.appendChild(scaleSlider);
        uiSection.appendChild(scaleGroup);

        // Haptic Feedback Toggle
        const hapticGroup = document.createElement('div');
        hapticGroup.className = 'ruffle-touch-setting-group setting-toggle-group';

        const hapticLabel = document.createElement('label');
        hapticLabel.textContent = 'Haptic Feedback (Vibration)';

        const hapticToggleLabel = document.createElement('label');
        hapticToggleLabel.className = 'ruffle-touch-switch';

        const hapticCheckbox = document.createElement('input');
        hapticCheckbox.type = 'checkbox';
        hapticCheckbox.checked = this.settings.haptic;
        hapticCheckbox.addEventListener('change', (e) => {
            this.settings.haptic = Boolean(e.target.checked);
            this.saveSettings();
            if (this.settings.haptic) {
                this.triggerHaptic();
            }
        });

        const hapticSliderSpan = document.createElement('span');
        hapticSliderSpan.className = 'switch-slider';

        hapticToggleLabel.appendChild(hapticCheckbox);
        hapticToggleLabel.appendChild(hapticSliderSpan);

        hapticGroup.appendChild(hapticLabel);
        hapticGroup.appendChild(hapticToggleLabel);
        uiSection.appendChild(hapticGroup);

        // Fullscreen Toggle Button
        const fullscreenGroup = document.createElement('div');
        fullscreenGroup.className = 'ruffle-touch-setting-group';

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.type = 'button';
        fullscreenBtn.className = 'ruffle-touch-btn-action';
        fullscreenBtn.innerHTML = '🖥️ Toggle Fullscreen';
        fullscreenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleFullscreen();
        });

        fullscreenGroup.appendChild(fullscreenBtn);
        uiSection.appendChild(fullscreenGroup);

        // Section 2: Flash Save Data Management
        const saveSection = document.createElement('div');
        saveSection.className = 'ruffle-touch-settings-section';

        const saveSectionTitle = document.createElement('h4');
        saveSectionTitle.textContent = 'Save Data Management';
        saveSection.appendChild(saveSectionTitle);

        const saveButtonsGroup = document.createElement('div');
        saveButtonsGroup.className = 'ruffle-touch-save-actions';

        // Export Saves Button
        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'ruffle-touch-btn-action';
        exportBtn.innerHTML = '📥 Export Saves';
        exportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.exportSaveData();
        });

        // Import Saves Button & Hidden File Input
        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'ruffle-touch-btn-action';
        importBtn.innerHTML = '📤 Import Saves';

        const importFileInput = document.createElement('input');
        importFileInput.type = 'file';
        importFileInput.accept = '.json';
        importFileInput.style.display = 'none';
        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importSaveDataFromFile(file);
                importFileInput.value = '';
            }
        });

        importBtn.addEventListener('click', (e) => {
            e.preventDefault();
            importFileInput.click();
        });

        // Clear Saves Button
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'ruffle-touch-btn-action btn-danger';
        clearBtn.innerHTML = '🗑️ Clear Saves';
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.clearSaveData();
        });

        saveButtonsGroup.appendChild(exportBtn);
        saveButtonsGroup.appendChild(importBtn);
        saveButtonsGroup.appendChild(importFileInput);
        saveButtonsGroup.appendChild(clearBtn);

        saveSection.appendChild(saveButtonsGroup);

        content.appendChild(uiSection);
        content.appendChild(saveSection);

        this.drawerElement.appendChild(header);
        this.drawerElement.appendChild(content);
    }

    /**
     * Open Settings Drawer
     */
    openSettingsDrawer() {
        if (this.drawerElement && this.drawerBackdrop) {
            this.drawerElement.classList.add('open');
            this.drawerBackdrop.classList.add('open');
        }
    }

    /**
     * Close Settings Drawer
     */
    closeSettingsDrawer() {
        if (this.drawerElement && this.drawerBackdrop) {
            this.drawerElement.classList.remove('open');
            this.drawerBackdrop.classList.remove('open');
        }
    }

    /**
     * Toggle Settings Drawer
     */
    toggleSettingsDrawer() {
        if (this.drawerElement && this.drawerElement.classList.contains('open')) {
            this.closeSettingsDrawer();
        } else {
            this.openSettingsDrawer();
        }
    }

    /**
     * Toggle browser fullscreen API
     */
    toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(err => console.warn('Fullscreen failed:', err));
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(err => console.warn('Exit fullscreen failed:', err));
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    /**
     * Helper to dump a single IndexedDB database to object
     */
    dumpDatabase(dbName) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName);
            req.onerror = () => reject(req.error);
            req.onsuccess = (e) => {
                const db = e.target.result;
                const storeNames = Array.from(db.objectStoreNames);
                if (storeNames.length === 0) {
                    db.close();
                    return resolve({ name: dbName, stores: [] });
                }

                const tx = db.transaction(storeNames, 'readonly');
                const storesData = [];
                let pending = storeNames.length;

                storeNames.forEach((storeName) => {
                    const store = tx.objectStore(storeName);
                    const getAllReq = store.getAll();
                    const getAllKeysReq = store.getAllKeys ? store.getAllKeys() : null;

                    getAllReq.onsuccess = () => {
                        const records = getAllReq.result;
                        if (getAllKeysReq) {
                            getAllKeysReq.onsuccess = () => {
                                const keys = getAllKeysReq.result;
                                const items = records.map((val, idx) => ({ key: keys[idx], value: val }));
                                storesData.push({ name: storeName, records: items });
                                pending--;
                                if (pending === 0) {
                                    db.close();
                                    resolve({ name: dbName, stores: storesData });
                                }
                            };
                            getAllKeysReq.onerror = () => {
                                storesData.push({ name: storeName, records: records.map(val => ({ value: val })) });
                                pending--;
                                if (pending === 0) {
                                    db.close();
                                    resolve({ name: dbName, stores: storesData });
                                }
                            };
                        } else {
                            storesData.push({ name: storeName, records: records.map(val => ({ value: val })) });
                            pending--;
                            if (pending === 0) {
                                db.close();
                                resolve({ name: dbName, stores: storesData });
                            }
                        }
                    };
                    getAllReq.onerror = () => {
                        pending--;
                        if (pending === 0) {
                            db.close();
                            resolve({ name: dbName, stores: storesData });
                        }
                    };
                });
            };
        });
    }

    /**
     * Export Ruffle/Flash Save Data from IndexedDB
     */
    async exportSaveData() {
        try {
            let dbNames = [];
            if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
                const dbs = await indexedDB.databases();
                dbNames = dbs.map(db => db.name).filter(Boolean);
            }
            if (dbNames.length === 0) {
                dbNames = ['ruffle', 'idb', 'sol', '/ruffle', 'RuffleStore'];
            }

            const backupData = {
                version: 1,
                exportedAt: new Date().toISOString(),
                databases: []
            };

            for (const dbName of dbNames) {
                try {
                    const dbData = await this.dumpDatabase(dbName);
                    if (dbData && dbData.stores.length > 0) {
                        backupData.databases.push(dbData);
                    }
                } catch (err) {
                    console.warn(`Could not dump IndexedDB database "${dbName}":`, err);
                }
            }

            if (backupData.databases.length === 0) {
                alert('No save data found in IndexedDB to export.');
                return;
            }

            const jsonStr = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ruffle-save-backup-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export save data failed:', err);
            alert('Failed to export save data: ' + err.message);
        }
    }

    /**
     * Read JSON save backup file and restore into IndexedDB
     */
    importSaveDataFromFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);
                await this.restoreSaveData(backupData);
                alert('Save data imported successfully! Reload page or restart SWF if needed.');
            } catch (err) {
                console.error('Import save data failed:', err);
                alert('Failed to import save data: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    /**
     * Restore IndexedDB databases from backup data
     */
    async restoreSaveData(backupData) {
        if (!backupData || !Array.isArray(backupData.databases)) {
            throw new Error('Invalid save backup file format.');
        }

        for (const dbDef of backupData.databases) {
            if (!dbDef.name || !Array.isArray(dbDef.stores)) continue;

            const storeNames = dbDef.stores.map(s => s.name);
            await new Promise((resolve, reject) => {
                const openReq = indexedDB.open(dbDef.name);

                openReq.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    storeNames.forEach(sName => {
                        if (!db.objectStoreNames.contains(sName)) {
                            db.createObjectStore(sName);
                        }
                    });
                };

                openReq.onsuccess = (e) => {
                    const db = e.target.result;
                    const missingStores = storeNames.filter(s => !db.objectStoreNames.contains(s));
                    if (missingStores.length > 0) {
                        const nextVersion = db.version + 1;
                        db.close();
                        const upgradeReq = indexedDB.open(dbDef.name, nextVersion);
                        upgradeReq.onupgradeneeded = (evt) => {
                            const upDb = evt.target.result;
                            missingStores.forEach(sName => {
                                if (!upDb.objectStoreNames.contains(sName)) {
                                    upDb.createObjectStore(sName);
                                }
                            });
                        };
                        upgradeReq.onsuccess = (evt) => {
                            const upDb = evt.target.result;
                            this.populateDatabase(upDb, dbDef.stores).then(resolve).catch(reject);
                        };
                        upgradeReq.onerror = () => reject(upgradeReq.error);
                    } else {
                        this.populateDatabase(db, dbDef.stores).then(resolve).catch(reject);
                    }
                };
                openReq.onerror = () => reject(openReq.error);
            });
        }
    }

    /**
     * Populate object stores in database
     */
    populateDatabase(db, stores) {
        return new Promise((resolve, reject) => {
            const existingStores = stores.map(s => s.name).filter(s => db.objectStoreNames.contains(s));
            if (existingStores.length === 0) {
                db.close();
                return resolve();
            }

            const tx = db.transaction(existingStores, 'readwrite');
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };

            stores.forEach(sDef => {
                if (!db.objectStoreNames.contains(sDef.name)) return;
                const store = tx.objectStore(sDef.name);
                sDef.records.forEach(rec => {
                    if (rec.key !== undefined) {
                        store.put(rec.value, rec.key);
                    } else {
                        store.put(rec.value);
                    }
                });
            });
        });
    }

    /**
     * Clear game save data from IndexedDB
     */
    async clearSaveData() {
        if (!confirm('Are you sure you want to clear all game save data? This action cannot be undone.')) {
            return;
        }

        try {
            let dbNames = [];
            if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
                const dbs = await indexedDB.databases();
                dbNames = dbs.map(db => db.name).filter(Boolean);
            }
            if (dbNames.length === 0) {
                dbNames = ['ruffle', 'idb', 'sol', '/ruffle', 'RuffleStore'];
            }

            for (const name of dbNames) {
                indexedDB.deleteDatabase(name);
            }
            alert('Game save data cleared successfully.');
        } catch (err) {
            console.error('Clear save data failed:', err);
            alert('Failed to clear save data: ' + err.message);
        }
    }

    /**
     * Dispatch keydown event
     */
    triggerKeyDown(keyId) {
        const def = this.keyDefinitions[keyId];
        if (!def) return;

        const target = this.target || window;
        const eventOptions = {
            key: def.key,
            code: def.code,
            keyCode: def.keyCode,
            which: def.keyCode,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        target.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        // Also dispatch on window if target is specific element to guarantee listener capture
        if (target !== window) {
            window.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        }
    }

    /**
     * Dispatch keyup event
     */
    triggerKeyUp(keyId) {
        const def = this.keyDefinitions[keyId];
        if (!def) return;

        const target = this.target || window;
        const eventOptions = {
            key: def.key,
            code: def.code,
            keyCode: def.keyCode,
            which: def.keyCode,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        target.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
        if (target !== window) {
            window.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
        }
    }

    /**
     * Toggle visibility of controls overlay
     */
    toggleVisibility() {
        this.visible = !this.visible;
        if (this.visible) {
            this.overlayElement.classList.remove('ruffle-touch-hidden');
            this.overlayElement.style.opacity = this.settings.opacity;
        } else {
            this.overlayElement.classList.add('ruffle-touch-hidden');
        }
    }

    /**
     * Show overlay
     */
    show() {
        this.visible = true;
        this.overlayElement.classList.remove('ruffle-touch-hidden');
        this.overlayElement.style.opacity = this.settings.opacity;
    }

    /**
     * Hide overlay
     */
    hide() {
        this.visible = false;
        this.overlayElement.classList.add('ruffle-touch-hidden');
    }

    /**
     * Clean up created DOM elements
     */
    destroy() {
        if (this.toolbarElement && this.toolbarElement.parentNode) {
            this.toolbarElement.parentNode.removeChild(this.toolbarElement);
        }
        if (this.overlayElement && this.overlayElement.parentNode) {
            this.overlayElement.parentNode.removeChild(this.overlayElement);
        }
        if (this.drawerBackdrop && this.drawerBackdrop.parentNode) {
            this.drawerBackdrop.parentNode.removeChild(this.drawerBackdrop);
        }
        if (this.drawerElement && this.drawerElement.parentNode) {
            this.drawerElement.parentNode.removeChild(this.drawerElement);
        }
    }
}

// Export module for browser/ES6 compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RuffleTouch;
} else if (typeof window !== 'undefined') {
    window.RuffleTouch = RuffleTouch;
}
