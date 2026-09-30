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
        this.toggleBtn = null;
        this.activeKeys = new Map();

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
     * Build the UI overlay DOM structure
     */
    init() {
        if (!this.container) {
            console.error('RuffleTouch: Container element not found.');
            return;
        }

        // Toggle Button (Top Corner)
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.className = 'ruffle-touch-toggle';
        this.toggleBtn.setAttribute('aria-label', 'Toggle Gamepad Controls');
        this.toggleBtn.type = 'button';
        this.toggleBtn.innerHTML = '🎮';
        this.toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleVisibility();
        });

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

        // Mount to container
        this.container.appendChild(this.toggleBtn);
        this.container.appendChild(this.overlayElement);
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
            this.triggerKeyDown(keyId);
        };

        const handleRelease = (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.remove('active');
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
        if (this.toggleBtn && this.toggleBtn.parentNode) {
            this.toggleBtn.parentNode.removeChild(this.toggleBtn);
        }
        if (this.overlayElement && this.overlayElement.parentNode) {
            this.overlayElement.parentNode.removeChild(this.overlayElement);
        }
    }
}

// Export module for browser/ES6 compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RuffleTouch;
} else if (typeof window !== 'undefined') {
    window.RuffleTouch = RuffleTouch;
}
