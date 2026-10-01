/**
 * RuffleTouch - On-screen Touch Gamepad Overlay for Ruffle Web Player
 */

class RuffleTouch {
    static AVAILABLE_KEYS = {
        'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, label: 'Up Arrow' },
        'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, label: 'Down Arrow' },
        'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, label: 'Left Arrow' },
        'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, label: 'Right Arrow' },
        'Space': { key: ' ', code: 'Space', keyCode: 32, label: 'Space' },
        'Enter': { key: 'Enter', code: 'Enter', keyCode: 13, label: 'Enter' },
        'KeyZ': { key: 'z', code: 'KeyZ', keyCode: 90, label: 'Z' },
        'KeyX': { key: 'x', code: 'KeyX', keyCode: 88, label: 'X' },
        'KeyA': { key: 'a', code: 'KeyA', keyCode: 65, label: 'A' },
        'KeyB': { key: 'b', code: 'KeyB', keyCode: 66, label: 'B' },
        'KeyY': { key: 'y', code: 'KeyY', keyCode: 89, label: 'Y' },
        'ShiftLeft': { key: 'Shift', code: 'ShiftLeft', keyCode: 16, label: 'Shift' },
        'ControlLeft': { key: 'Control', code: 'ControlLeft', keyCode: 17, label: 'Ctrl' },
        'KeyW': { key: 'w', code: 'KeyW', keyCode: 87, label: 'W' },
        'KeyS': { key: 's', code: 'KeyS', keyCode: 83, label: 'S' },
        'KeyD': { key: 'd', code: 'KeyD', keyCode: 68, label: 'D' },
        'KeyJ': { key: 'j', code: 'KeyJ', keyCode: 74, label: 'J' },
        'KeyK': { key: 'k', code: 'KeyK', keyCode: 75, label: 'K' }
    };

    /**
     * @param {Object} options Configuration options
     * @param {HTMLElement|string} [options.container] Parent container element where controls overlay will be attached (defaults to document.body)
     * @param {HTMLElement|Window} [options.target] Target element to receive keyboard events (defaults to window)
     * @param {HTMLElement} [options.player] Ruffle player instance reference
     * @param {boolean} [options.visible=true] Initial visibility state of controls
     * @param {Function} [options.onFileSelect] Callback when user selects a file from toolbar/drawer
     */
    constructor(options = {}) {
        if (typeof options === 'string') {
            options = { container: options };
        }

        this.options = options;
        this.container = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : (options.container || document.body);

        this.player = options.player || null;
        this.target = options.target || this.player || window;
        this.visible = options.visible !== undefined ? Boolean(options.visible) : true;
        this.onFileSelect = options.onFileSelect || null;

        this.overlayElement = null;
        this.toolbarElement = null;
        this.toggleBtn = null;
        this.settingsBtn = null;
        this.openSwfBtn = null;
        this.drawerElement = null;
        this.drawerBackdrop = null;

        // Active key tracking to eliminate duplicate events
        this.activeKeys = new Set();
        this.activeDpadKeys = new Set();

        this.settings = this.loadSettings();

        // Active mode: 'gamepad' or 'mouse'
        this.inputMode = this.settings.inputMode || 'gamepad';
        this.modeBtn = null;
        this.toastElement = null;
        this.toastTimeout = null;

        // Currently loaded SWF binary data for download/archival
        this.loadedSwfData = null; // ArrayBuffer or Blob
        this.loadedSwfFilename = "game.swf";
        this.downloadBtn = null;
        this.drawerDownloadBtn = null;

        // Preset Key Mappings Definition Table
        this.presets = {
            'classic': {
                'up': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, label: '▲' },
                'down': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, label: '▼' },
                'left': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, label: '◀' },
                'right': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, label: '▶' },
                'space': { key: ' ', code: 'Space', keyCode: 32, label: 'SPACE' },
                'enter': { key: 'Enter', code: 'Enter', keyCode: 13, label: 'ENTER' },
                'z': { key: 'z', code: 'KeyZ', keyCode: 90, label: 'Z' },
                'x': { key: 'x', code: 'KeyX', keyCode: 88, label: 'X' }
            },
            'wasd': {
                'up': { key: 'w', code: 'KeyW', keyCode: 87, label: 'W' },
                'down': { key: 's', code: 'KeyS', keyCode: 83, label: 'S' },
                'left': { key: 'a', code: 'KeyA', keyCode: 65, label: 'A' },
                'right': { key: 'd', code: 'KeyD', keyCode: 68, label: 'D' },
                'space': { key: ' ', code: 'Space', keyCode: 32, label: 'SPACE' },
                'enter': { key: 'Enter', code: 'Enter', keyCode: 13, label: 'ENTER' },
                'z': { key: 'j', code: 'KeyJ', keyCode: 74, label: 'J' },
                'x': { key: 'k', code: 'KeyK', keyCode: 75, label: 'K' }
            }
        };

        this.keyDefinitions = this.getEffectiveMappings();

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
            haptic: true,
            inputMode: 'gamepad', // 'gamepad' or 'mouse'
            mappingPreset: 'classic', // 'classic', 'wasd', or 'custom'
            customMappings: null
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

    /**
     * Update labels on active touch buttons when mappings change
     */
    updateButtonLabels() {
        if (!this.overlayElement) return;

        const actionButtons = {
            'z': this.overlayElement.querySelector('.action-z'),
            'x': this.overlayElement.querySelector('.action-x'),
            'space': this.overlayElement.querySelector('.action-space'),
            'enter': this.overlayElement.querySelector('.action-enter')
        };

        for (const [keyId, btn] of Object.entries(actionButtons)) {
            if (btn && this.keyDefinitions[keyId]) {
                const label = this.keyDefinitions[keyId].label || keyId.toUpperCase();
                btn.textContent = label;
            }
        }
    }

    /**
     * Apply a key mapping preset ('classic', 'wasd', or 'custom')
     */
    setPreset(presetName) {
        this.settings.mappingPreset = presetName;
        if (presetName === 'custom' && !this.settings.customMappings) {
            this.settings.customMappings = JSON.parse(JSON.stringify(this.keyDefinitions));
        }
        this.keyDefinitions = this.getEffectiveMappings();
        this.updateButtonLabels();
        this.saveSettings();
    }

    /**
     * Update a single action button mapping
     */
    setCustomKeyMapping(actionId, keyOptionCode) {
        const option = RuffleTouch.AVAILABLE_KEYS[keyOptionCode];
        if (!option) return;

        if (!this.settings.customMappings) {
            this.settings.customMappings = JSON.parse(JSON.stringify(this.keyDefinitions));
        }

        this.settings.customMappings[actionId] = {
            key: option.key,
            code: option.code,
            keyCode: option.keyCode,
            label: option.label.replace(/^[▲▼◀▶]\s*/, '')
        };

        this.settings.mappingPreset = 'custom';
        this.keyDefinitions = this.getEffectiveMappings();
        this.updateButtonLabels();
        this.saveSettings();
    }

    /**
     * Get active key mappings based on preset or custom settings
     */
    getEffectiveMappings() {
        const preset = this.settings.mappingPreset || 'classic';
        if (preset === 'custom' && this.settings.customMappings) {
            return JSON.parse(JSON.stringify(this.settings.customMappings));
        }
        if (this.presets[preset]) {
            return JSON.parse(JSON.stringify(this.presets[preset]));
        }
        return JSON.parse(JSON.stringify(this.presets['classic']));
    }

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
                navigator.vibrate(20);
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
        this.target = window; // Synthetic events are dispatched directly to window to prevent duplicate firing
    }

    /**
     * Set or update the Ruffle player instance
     * @param {HTMLElement} player
     */
    setPlayer(player) {
        this.player = player;
        this.target = window;
    }

    /**
     * Focus Ruffle player instance if set and available
     */
    focusPlayer() {
        if (this.player && typeof this.player.focus === 'function') {
            try {
                this.player.focus();
            } catch (err) {
                // Ignore focus errors
            }
        }
    }

    /**
     * Attach background/edge touch & click listeners for focus lock
     */
    attachBackgroundTouchTrap() {
        const handleTrap = (e) => {
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
     * Helper to prompt file selection
     */
    promptFileSelection() {
        const fileInput = document.getElementById('global-swf-input') || document.createElement('input');
        if (!fileInput.parentNode && fileInput.type !== 'file') {
            fileInput.type = 'file';
            fileInput.accept = '.swf';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
        }

        const handleChange = (e) => {
            const file = e.target.files[0];
            if (file && typeof this.onFileSelect === 'function') {
                this.onFileSelect(file);
            }
            fileInput.removeEventListener('change', handleChange);
        };

        fileInput.addEventListener('change', handleChange);
        fileInput.click();
    }


    /**
     * Set input mode ('gamepad' or 'mouse')
     */
    setMode(mode, showToast = true) {
        if (mode !== 'gamepad' && mode !== 'mouse') return;

        this.inputMode = mode;
        this.settings.inputMode = mode;
        this.saveSettings();

        if (this.modeBtn) {
            if (this.inputMode === 'mouse') {
                this.modeBtn.innerHTML = '🖱️';
                this.modeBtn.setAttribute('aria-label', 'Switch to Gamepad Mode');
                this.modeBtn.title = 'Mouse Mode active - Click to switch to Gamepad Mode';
            } else {
                this.modeBtn.innerHTML = '🎮';
                this.modeBtn.setAttribute('aria-label', 'Switch to Mouse Mode');
                this.modeBtn.title = 'Gamepad Mode active - Click to switch to Mouse Mode';
            }
        }

        // In Mouse Mode, hide controls overlay so touch directly interacts with canvas
        if (this.overlayElement) {
            if (this.inputMode === 'mouse') {
                this.overlayElement.classList.add('ruffle-touch-hidden');
            } else if (this.visible) {
                this.overlayElement.classList.remove('ruffle-touch-hidden');
            }
        }

        if (showToast) {
            const toastText = this.inputMode === 'mouse'
                ? '🖱️ Mouse Mode (Touch directly controls canvas)'
                : '🎮 Gamepad Mode (Virtual controls enabled)';
            this.showToast(toastText);
        }
    }

    /**
     * Toggle between Gamepad Mode and Mouse Mode
     */
    toggleMode() {
        const newMode = this.inputMode === 'gamepad' ? 'mouse' : 'gamepad';
        this.setMode(newMode, true);
    }

    /**
     * Show floating toast notification pill
     */
    showToast(message) {
        if (!this.toastElement) {
            this.toastElement = document.createElement('div');
            this.toastElement.className = 'ruffle-touch-toast';
            this.container.appendChild(this.toastElement);
        }

        this.toastElement.textContent = message;
        this.toastElement.classList.add('show');

        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }

        this.toastTimeout = setTimeout(() => {
            if (this.toastElement) {
                this.toastElement.classList.remove('show');
            }
        }, 2200);
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

        // Open SWF Folder Button (📁)
        // Download SWF Button (📥)
        this.downloadBtn = document.createElement('button');
        this.downloadBtn.className = 'ruffle-touch-toolbar-btn ruffle-touch-download-swf';
        this.downloadBtn.setAttribute('aria-label', 'Download / Archive SWF File');
        this.downloadBtn.title = 'Download SWF file to device';
        this.downloadBtn.type = 'button';
        this.downloadBtn.innerHTML = '📥';
        this.downloadBtn.style.display = this.loadedSwfData ? 'flex' : 'none';
        this.downloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.downloadSwf();
        });

        this.openSwfBtn = document.createElement('button');
        this.openSwfBtn.className = 'ruffle-touch-toolbar-btn ruffle-touch-open-swf';
        this.openSwfBtn.setAttribute('aria-label', 'Open / Change SWF File');
        this.openSwfBtn.type = 'button';
        this.openSwfBtn.innerHTML = '📁';
        this.openSwfBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.promptFileSelection();
        });

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

        // Mode Switcher Button (🎮 / 🖱️)
        this.modeBtn = document.createElement('button');
        this.modeBtn.className = 'ruffle-touch-toolbar-btn ruffle-touch-mode';
        this.modeBtn.type = 'button';
        this.modeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleMode();
            this.focusPlayer();
        });

        // Visibility Toggle Button (👁️ / 🙈)
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.className = 'ruffle-touch-toolbar-btn ruffle-touch-toggle';
        this.toggleBtn.setAttribute('aria-label', 'Toggle Gamepad Overlay Visibility');
        this.toggleBtn.type = 'button';
        this.toggleBtn.innerHTML = '👁️';
        this.toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleVisibility();
            this.focusPlayer();
        });

        this.toolbarElement.appendChild(this.downloadBtn);
        this.toolbarElement.appendChild(this.openSwfBtn);
        this.toolbarElement.appendChild(this.modeBtn);
        this.toolbarElement.appendChild(this.settingsBtn);
        this.toolbarElement.appendChild(this.toggleBtn);

        // Overlay Main Wrapper
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'ruffle-touch-overlay';
        if (!this.visible) {
            this.overlayElement.classList.add('ruffle-touch-hidden');
        }

        // D-Pad Construction (8-Way Directional Pad)
        const dpadContainer = this.createDpad();

        // Action Buttons (Bottom-Right)
        const actionContainer = document.createElement('div');
        actionContainer.className = 'ruffle-touch-actions';

        const btnZ = this.createActionButton('z', 'ruffle-touch-btn action-z');
        const btnX = this.createActionButton('x', 'ruffle-touch-btn action-x');
        const btnSpace = this.createActionButton('space', 'ruffle-touch-btn action-space');
        const btnEnter = this.createActionButton('enter', 'ruffle-touch-btn action-enter');

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

        // Apply initial input mode & settings styling
        this.setMode(this.inputMode, false);
        this.applySettings();
    }

    /**
     * Create 8-Way Interactive D-Pad with diagonal touch sliding support
     */
    createDpad() {
        const dpadContainer = document.createElement('div');
        dpadContainer.className = 'ruffle-touch-dpad';

        // Cardinal Buttons
        const btnUp = document.createElement('div');
        btnUp.className = 'ruffle-touch-btn dpad-btn dpad-up';
        btnUp.dataset.key = 'up';
        btnUp.textContent = '▲';

        const btnDown = document.createElement('div');
        btnDown.className = 'ruffle-touch-btn dpad-btn dpad-down';
        btnDown.dataset.key = 'down';
        btnDown.textContent = '▼';

        const btnLeft = document.createElement('div');
        btnLeft.className = 'ruffle-touch-btn dpad-btn dpad-left';
        btnLeft.dataset.key = 'left';
        btnLeft.textContent = '◀';

        const btnRight = document.createElement('div');
        btnRight.className = 'ruffle-touch-btn dpad-btn dpad-right';
        btnRight.dataset.key = 'right';
        btnRight.textContent = '▶';

        // Diagonal Visual Indicators / Hit zones
        const diagUpLeft = document.createElement('div');
        diagUpLeft.className = 'dpad-diag dpad-diag-ul';
        diagUpLeft.dataset.diag = 'up,left';

        const diagUpRight = document.createElement('div');
        diagUpRight.className = 'dpad-diag dpad-diag-ur';
        diagUpRight.dataset.diag = 'up,right';

        const diagDownLeft = document.createElement('div');
        diagDownLeft.className = 'dpad-diag dpad-diag-dl';
        diagDownLeft.dataset.diag = 'down,left';

        const diagDownRight = document.createElement('div');
        diagDownRight.className = 'dpad-diag dpad-diag-dr';
        diagDownRight.dataset.diag = 'down,right';

        const dpadCenter = document.createElement('div');
        dpadCenter.className = 'dpad-center';

        dpadContainer.appendChild(btnUp);
        dpadContainer.appendChild(btnDown);
        dpadContainer.appendChild(btnLeft);
        dpadContainer.appendChild(btnRight);
        dpadContainer.appendChild(diagUpLeft);
        dpadContainer.appendChild(diagUpRight);
        dpadContainer.appendChild(diagDownLeft);
        dpadContainer.appendChild(diagDownRight);
        dpadContainer.appendChild(dpadCenter);

        const buttonsMap = {
            'up': btnUp,
            'down': btnDown,
            'left': btnLeft,
            'right': btnRight,
            'up,left': diagUpLeft,
            'up,right': diagUpRight,
            'down,left': diagDownLeft,
            'down,right': diagDownRight
        };

        let isPointerActive = false;

        const processDpadTouch = (clientX, clientY) => {
            const rect = dpadContainer.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = clientX - centerX;
            const dy = clientY - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Deadzone: if touch is too close to center, treat as inactive
            const deadzone = rect.width * 0.12;
            if (dist < deadzone) {
                return [];
            }

            // Calculate angle in degrees (-180 to 180, 0 is Right, 90 is Down)
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            // 8-Way Directional Angle Mapping (45-degree sectors)
            if (angle >= -22.5 && angle < 22.5) {
                return ['right'];
            } else if (angle >= 22.5 && angle < 67.5) {
                return ['down', 'right'];
            } else if (angle >= 67.5 && angle < 112.5) {
                return ['down'];
            } else if (angle >= 112.5 && angle < 157.5) {
                return ['down', 'left'];
            } else if (angle >= 157.5 || angle < -157.5) {
                return ['left'];
            } else if (angle >= -157.5 && angle < -112.5) {
                return ['up', 'left'];
            } else if (angle >= -112.5 && angle < -67.5) {
                return ['up'];
            } else if (angle >= -67.5 && angle < -22.5) {
                return ['up', 'right'];
            }

            return [];
        };

        const updateDpadState = (newKeys) => {
            const newKeysSet = new Set(newKeys);

            // Determine released keys
            for (const keyId of this.activeDpadKeys) {
                if (!newKeysSet.has(keyId)) {
                    this.triggerKeyUp(keyId);
                    if (buttonsMap[keyId]) buttonsMap[keyId].classList.remove('active');
                }
            }

            // Determine newly pressed keys
            let newlyPressed = false;
            for (const keyId of newKeysSet) {
                if (!this.activeDpadKeys.has(keyId)) {
                    this.triggerKeyDown(keyId);
                    if (buttonsMap[keyId]) buttonsMap[keyId].classList.add('active');
                    newlyPressed = true;
                }
            }

            // Update diagonal visual indicator states
            diagUpLeft.classList.toggle('active', newKeysSet.has('up') && newKeysSet.has('left'));
            diagUpRight.classList.toggle('active', newKeysSet.has('up') && newKeysSet.has('right'));
            diagDownLeft.classList.toggle('active', newKeysSet.has('down') && newKeysSet.has('left'));
            diagDownRight.classList.toggle('active', newKeysSet.has('down') && newKeysSet.has('right'));

            if (newlyPressed) {
                this.triggerHaptic();
            }

            this.activeDpadKeys = newKeysSet;
        };

        const releaseAllDpad = () => {
            for (const keyId of this.activeDpadKeys) {
                this.triggerKeyUp(keyId);
                if (buttonsMap[keyId]) buttonsMap[keyId].classList.remove('active');
            }
            diagUpLeft.classList.remove('active');
            diagUpRight.classList.remove('active');
            diagDownLeft.classList.remove('active');
            diagDownRight.classList.remove('active');
            this.activeDpadKeys.clear();
        };

        const handlePointerDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isPointerActive = true;
            dpadContainer.setPointerCapture(e.pointerId);
            this.focusPlayer();
            const keys = processDpadTouch(e.clientX, e.clientY);
            updateDpadState(keys);
        };

        const handlePointerMove = (e) => {
            if (!isPointerActive) return;
            e.preventDefault();
            e.stopPropagation();
            const keys = processDpadTouch(e.clientX, e.clientY);
            updateDpadState(keys);
        };

        const handlePointerUp = (e) => {
            if (!isPointerActive) return;
            e.preventDefault();
            e.stopPropagation();
            isPointerActive = false;
            try { dpadContainer.releasePointerCapture(e.pointerId); } catch (err) {}
            releaseAllDpad();
            this.focusPlayer();
        };

        dpadContainer.addEventListener('pointerdown', handlePointerDown);
        dpadContainer.addEventListener('pointermove', handlePointerMove);
        dpadContainer.addEventListener('pointerup', handlePointerUp);
        dpadContainer.addEventListener('pointercancel', handlePointerUp);
        dpadContainer.addEventListener('contextmenu', (e) => e.preventDefault());

        return dpadContainer;
    }

    /**
     * Create individual action touch button with single-dispatch listeners
     */
    createActionButton(keyId, className) {
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

        btn.addEventListener('pointerdown', handlePress);
        btn.addEventListener('pointerup', handleRelease);
        btn.addEventListener('pointercancel', handleRelease);
        btn.addEventListener('pointerleave', handleRelease);
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

        // Quick Actions: Open SWF & Fullscreen
        const quickActionsGroup = document.createElement('div');
        quickActionsGroup.className = 'ruffle-touch-setting-group';

        const downloadSwfDrawerBtn = document.createElement('button');
        downloadSwfDrawerBtn.type = 'button';
        downloadSwfDrawerBtn.className = 'ruffle-touch-btn-action ruffle-touch-download-swf';
        downloadSwfDrawerBtn.innerHTML = '📥 Download / Archive SWF';
        downloadSwfDrawerBtn.style.display = this.loadedSwfData ? 'flex' : 'none';
        downloadSwfDrawerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadSwf();
        });
        this.drawerDownloadBtn = downloadSwfDrawerBtn;

        const openSwfDrawerBtn = document.createElement('button');
        openSwfDrawerBtn.type = 'button';
        openSwfDrawerBtn.className = 'ruffle-touch-btn-action';
        openSwfDrawerBtn.innerHTML = '📁 Open / Change SWF File';
        openSwfDrawerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.closeSettingsDrawer();
            this.promptFileSelection();
        });

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.type = 'button';
        fullscreenBtn.className = 'ruffle-touch-btn-action';
        fullscreenBtn.innerHTML = '🖥️ Toggle Fullscreen';
        fullscreenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleFullscreen();
        });

        quickActionsGroup.appendChild(downloadSwfDrawerBtn);
        quickActionsGroup.appendChild(openSwfDrawerBtn);
        quickActionsGroup.appendChild(fullscreenBtn);
        uiSection.appendChild(quickActionsGroup);

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


        // Section: Key Mapping
        const mappingSection = document.createElement('div');
        mappingSection.className = 'ruffle-touch-settings-section';

        const mappingSectionTitle = document.createElement('h4');
        mappingSectionTitle.textContent = 'Key Mapping & Presets';
        mappingSection.appendChild(mappingSectionTitle);

        // Preset Dropdown Group
        const presetGroup = document.createElement('div');
        presetGroup.className = 'ruffle-touch-setting-group';

        const presetLabelRow = document.createElement('div');
        presetLabelRow.className = 'setting-label-row';
        const presetLabel = document.createElement('label');
        presetLabel.textContent = 'Preset Profile';
        presetLabelRow.appendChild(presetLabel);

        const presetSelect = document.createElement('select');
        presetSelect.className = 'ruffle-touch-select';

        const presetsOptions = [
            { id: 'classic', name: 'Classic (Arrows + Z/X/Space)' },
            { id: 'wasd', name: 'WASD + Space' },
            { id: 'custom', name: 'Custom Mapping' }
        ];

        presetsOptions.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            opt.selected = (this.settings.mappingPreset || 'classic') === p.id;
            presetSelect.appendChild(opt);
        });

        presetGroup.appendChild(presetLabelRow);
        presetGroup.appendChild(presetSelect);
        mappingSection.appendChild(presetGroup);

        // Individual Action Button Remapping Controls
        const mappingGrid = document.createElement('div');
        mappingGrid.className = 'ruffle-touch-mapping-grid';

        const actionsToMap = [
            { id: 'up', name: 'D-Pad Up' },
            { id: 'down', name: 'D-Pad Down' },
            { id: 'left', name: 'D-Pad Left' },
            { id: 'right', name: 'D-Pad Right' },
            { id: 'z', name: 'Button Z (Primary)' },
            { id: 'x', name: 'Button X (Secondary)' },
            { id: 'space', name: 'Button Space' },
            { id: 'enter', name: 'Button Enter' }
        ];

        const selectElements = {};

        actionsToMap.forEach(act => {
            const row = document.createElement('div');
            row.className = 'mapping-row';

            const label = document.createElement('span');
            label.className = 'mapping-label';
            label.textContent = act.name;

            const select = document.createElement('select');
            select.className = 'ruffle-touch-select select-sm';

            const currentDef = this.keyDefinitions[act.id] || {};

            Object.entries(RuffleTouch.AVAILABLE_KEYS).forEach(([code, item]) => {
                const opt = document.createElement('option');
                opt.value = code;
                opt.textContent = item.label;
                if (currentDef.code === item.code || currentDef.key === item.key) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });

            select.addEventListener('change', (e) => {
                this.setCustomKeyMapping(act.id, e.target.value);
                presetSelect.value = 'custom';
            });

            selectElements[act.id] = select;

            row.appendChild(label);
            row.appendChild(select);
            mappingGrid.appendChild(row);
        });

        mappingSection.appendChild(mappingGrid);

        const updateSelectsToMatchCurrent = () => {
            actionsToMap.forEach(act => {
                const sel = selectElements[act.id];
                if (!sel) return;
                const currentDef = this.keyDefinitions[act.id] || {};
                for (let i = 0; i < sel.options.length; i++) {
                    const code = sel.options[i].value;
                    const item = RuffleTouch.AVAILABLE_KEYS[code];
                    if (item && (item.code === currentDef.code || item.key === currentDef.key)) {
                        sel.selectedIndex = i;
                        break;
                    }
                }
            });
        };

        presetSelect.addEventListener('change', (e) => {
            this.setPreset(e.target.value);
            updateSelectsToMatchCurrent();
        });

        content.appendChild(uiSection);
        content.appendChild(mappingSection);
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
     * Dispatch keydown event ONCE ONLY directly to window with bubbles: true
     */
    triggerKeyDown(keyId) {
        const def = this.keyDefinitions[keyId];
        if (!def) return;

        if (this.activeKeys.has(keyId)) return; // Prevent key repeat if already active
        this.activeKeys.add(keyId);

        const eventOptions = {
            key: def.key,
            code: def.code,
            keyCode: def.keyCode,
            which: def.keyCode,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        window.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    }

    /**
     * Dispatch keyup event ONCE ONLY directly to window
     */
    triggerKeyUp(keyId) {
        const def = this.keyDefinitions[keyId];
        if (!def) return;

        this.activeKeys.delete(keyId);

        const eventOptions = {
            key: def.key,
            code: def.code,
            keyCode: def.keyCode,
            which: def.keyCode,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        window.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
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

    /**
     * Store loaded SWF binary data and enable download buttons
     * @param {ArrayBuffer|Blob} data
     * @param {string} [filename="game.swf"]
     */
    setLoadedSwf(data, filename = "game.swf") {
        this.loadedSwfData = data;
        this.loadedSwfFilename = filename || "game.swf";

        if (this.downloadBtn) {
            this.downloadBtn.style.display = "flex";
        }
        if (this.drawerDownloadBtn) {
            this.drawerDownloadBtn.style.display = "flex";
        }
    }

    /**
     * Trigger browser download of current SWF file
     */
    downloadSwf() {
        if (!this.loadedSwfData) {
            this.showToast("⚠️ No SWF loaded to download");
            return;
        }

        try {
            const blob = this.loadedSwfData instanceof Blob
                ? this.loadedSwfData
                : new Blob([this.loadedSwfData], { type: "application/x-shockwave-flash" });

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = this.loadedSwfFilename.endsWith(".swf") ? this.loadedSwfFilename : `${this.loadedSwfFilename}.swf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showToast(`📥 Downloading ${a.download}...`);
        } catch (err) {
            console.error("RuffleTouch: Download SWF failed", err);
            this.showToast("❌ Download failed");
        }
    }

    static extractSwfUrlFromHtml(html, baseUrl) {
        if (!html) return null;

        let foundUrl = null;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            // 1. Inspect <embed src="...">
            const embeds = doc.querySelectorAll("embed[src]");
            for (const embed of embeds) {
                const src = embed.getAttribute("src");
                if (src && src.toLowerCase().includes(".swf")) {
                    foundUrl = src;
                    break;
                }
            }

            // 2. Inspect <object data="...">
            if (!foundUrl) {
                const objects = doc.querySelectorAll("object[data]");
                for (const obj of objects) {
                    const data = obj.getAttribute("data");
                    if (data && data.toLowerCase().includes(".swf")) {
                        foundUrl = data;
                        break;
                    }
                }
            }

            // 3. Inspect <param name="movie" value="..."> or <param name="src" value="...">
            if (!foundUrl) {
                const params = doc.querySelectorAll("param");
                for (const param of params) {
                    const name = (param.getAttribute("name") || "").toLowerCase();
                    const value = param.getAttribute("value");
                    if ((name === "movie" || name === "src" || name === "filename") && value && value.toLowerCase().includes(".swf")) {
                        foundUrl = value;
                        break;
                    }
                }
            }
        } catch (err) {
            console.warn("RuffleTouch: DOM parsing error:", err);
        }

        // 4. Regex pattern search for https?://[^"'\s]+\.swf or relative .+\.swf
        if (!foundUrl) {
            const matches = html.match(/https?:\/\/[^"'\s<>]+\.swf(?:\?[^"'\s<>]*)?/gi) ||
                            html.match(/[^"'\s<>]+\.swf(?:\?[^"'\s<>]*)?/gi);
            if (matches && matches.length > 0) {
                foundUrl = matches[0];
            }
        }

        if (!foundUrl) return null;

        try {
            return new URL(foundUrl, baseUrl).href;
        } catch (e) {
            return foundUrl;
        }
    }

    /**
     * Helper to fetch a resource with fallback CORS proxies
     * @param {string} targetUrl
     * @param {string} [responseType="arraybuffer"] "arraybuffer" or "text"
     */
    static async fetchWithCorsProxy(targetUrl, responseType = "arraybuffer") {
        const proxies = [
            (u) => u,
            (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
            (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`
        ];

        let lastError = null;

        for (const makeUrl of proxies) {
            const proxyUrl = makeUrl(targetUrl);
            try {
                const res = await fetch(proxyUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

                if (responseType === "text") {
                    const text = await res.text();
                    if (text) return text;
                } else {
                    const buf = await res.arrayBuffer();
                    if (buf && buf.byteLength > 0) return buf;
                }
            } catch (err) {
                lastError = err;
            }
        }

        throw lastError || new Error(`Failed to fetch ${targetUrl} via all proxy attempts.`);
    }

    /**
     * Fetch direct .swf URL or extract .swf from webpage URL
     * @param {string} inputUrl
     * @param {Function} [statusCallback] (message, isError)
     */
    static async fetchAndExtractSwf(inputUrl, statusCallback = () => {}) {
        let url = inputUrl.trim();
        if (!url) {
            throw new Error("URL cannot be empty.");
        }

        if (!/^https?:\/\//i.test(url)) {
            url = "https://" + url;
        }

        const isDirectSwf = url.split("?")[0].toLowerCase().endsWith(".swf");

        if (isDirectSwf) {
            statusCallback("Downloading SWF file...", false);
            const arrayBuffer = await RuffleTouch.fetchWithCorsProxy(url, "arraybuffer");

            // Extract filename from URL
            const urlPath = url.split("?")[0];
            const fileName = urlPath.substring(urlPath.lastIndexOf("/") + 1) || "game.swf";

            return {
                data: arrayBuffer,
                swfUrl: url,
                filename: fileName
            };
        } else {
            statusCallback("Extracting SWF from webpage...", false);
            let htmlText = "";
            try {
                htmlText = await RuffleTouch.fetchWithCorsProxy(url, "text");
            } catch (err) {
                throw new Error("Unable to fetch webpage content. Check the URL and try again.");
            }

            const extractedSwfUrl = RuffleTouch.extractSwfUrlFromHtml(htmlText, url);
            if (!extractedSwfUrl) {
                throw new Error("No SWF file found on the provided webpage.");
            }

            statusCallback(`SWF found: ${extractedSwfUrl.split("/").pop()}. Downloading...`, false);
            const arrayBuffer = await RuffleTouch.fetchWithCorsProxy(extractedSwfUrl, "arraybuffer");

            const urlPath = extractedSwfUrl.split("?")[0];
            const fileName = urlPath.substring(urlPath.lastIndexOf("/") + 1) || "game.swf";

            return {
                data: arrayBuffer,
                swfUrl: extractedSwfUrl,
                filename: fileName
            };
        }
    }
}

// Export module for browser/ES6 compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RuffleTouch;
} else if (typeof window !== 'undefined') {
    window.RuffleTouch = RuffleTouch;
}
