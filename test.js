const assert = require('assert');
const RuffleTouch = require('./src/ruffle-touch.js');

// Mock DOMParser for Node environment testing of extractSwfUrlFromHtml
global.DOMParser = class DOMParser {
    parseFromString(html, type) {
        return {
            querySelectorAll: (selector) => {
                const results = [];
                if (selector === 'embed[src]') {
                    const matches = html.matchAll(/<embed[^>]+src=["']([^"']+)["']/gi);
                    for (const m of matches) {
                        results.push({ getAttribute: (attr) => attr === 'src' ? m[1] : null });
                    }
                } else if (selector === 'object[data]') {
                    const matches = html.matchAll(/<object[^>]+data=["']([^"']+)["']/gi);
                    for (const m of matches) {
                        results.push({ getAttribute: (attr) => attr === 'data' ? m[1] : null });
                    }
                } else if (selector === 'param') {
                    const matches = html.matchAll(/<param[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']+)["']/gi);
                    for (const m of matches) {
                        results.push({
                            getAttribute: (attr) => {
                                if (attr === 'name') return m[1];
                                if (attr === 'value') return m[2];
                                return null;
                            }
                        });
                    }
                }
                return results;
            }
        };
    };
};

async function runTests() {
    console.log('--- Test 1: Magic byte validation (isValidSwf) ---');

    // FWS (Uncompressed Flash)
    const fwsBytes = new Uint8Array([0x46, 0x57, 0x53, 0x0A, 0x00]);
    assert.strictEqual(RuffleTouch.isValidSwf(fwsBytes.buffer), true, 'FWS ArrayBuffer should be valid');
    assert.strictEqual(RuffleTouch.isValidSwf(fwsBytes), true, 'FWS Uint8Array should be valid');

    // CWS (ZLIB Compressed Flash)
    const cwsBytes = new Uint8Array([0x43, 0x57, 0x53, 0x0D, 0x00]);
    assert.strictEqual(RuffleTouch.isValidSwf(cwsBytes.buffer), true, 'CWS should be valid');

    // ZWS (LZMA Compressed Flash)
    const zwsBytes = new Uint8Array([0x5A, 0x57, 0x53, 0x01, 0x00]);
    assert.strictEqual(RuffleTouch.isValidSwf(zwsBytes.buffer), true, 'ZWS should be valid');

    // Invalid magic bytes
    const htmlBytes = new Uint8Array(Buffer.from('<!DOCTYPE html><html></html>'));
    assert.strictEqual(RuffleTouch.isValidSwf(htmlBytes.buffer), false, 'HTML should not be valid SWF');
    assert.strictEqual(RuffleTouch.isValidSwf(null), false, 'null should return false');
    assert.strictEqual(RuffleTouch.isValidSwf(new Uint8Array([0x46, 0x57])), false, 'Too short buffer should return false');

    console.log('✅ Test 1 Passed!');

    console.log('--- Test 2: Proxy fallback order (fetchWithCorsProxy) ---');
    const calledUrls = [];

    // Mock global.fetch
    global.fetch = async (url, options) => {
        calledUrls.push(url);
        if (url.startsWith('https://direct-fail.com')) {
            throw new TypeError('Failed to fetch (CORS error)');
        }
        if (url.startsWith('https://m5-cors.claus-valca67.workers.dev')) {
            return {
                ok: false,
                status: 502,
                statusText: 'Bad Gateway'
            };
        }
        if (url.startsWith('https://api.allorigins.win')) {
            return {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            };
        }
        if (url.startsWith('https://api.codetabs.com')) {
            // Return valid SWF on codetabs fallback
            const buffer = new Uint8Array([0x46, 0x57, 0x53, 0x01]).buffer;
            return {
                ok: true,
                status: 200,
                arrayBuffer: async () => buffer,
                text: async () => 'FWS\x01'
            };
        }
        return {
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
        };
    };

    const targetUrl = 'https://direct-fail.com/game.swf';
    const resultBuf = await RuffleTouch.fetchWithCorsProxy(targetUrl, 'arraybuffer');

    assert.strictEqual(calledUrls.length, 4, 'Should attempt 4 proxy URLs');
    assert.strictEqual(calledUrls[0], 'https://direct-fail.com/game.swf', 'Step 1: Direct fetch');
    assert.strictEqual(calledUrls[1], `https://m5-cors.claus-valca67.workers.dev/?url=${encodeURIComponent(targetUrl)}`, 'Step 2: Cloudflare CORS Worker proxy');
    assert.strictEqual(calledUrls[2], `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, 'Step 3: allorigins');
    assert.strictEqual(calledUrls[3], `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, 'Step 4: codetabs');
    assert.strictEqual(RuffleTouch.isValidSwf(resultBuf), true, 'Result should be valid SWF');
    assert.strictEqual(calledUrls.some(u => u.includes('corsproxy.io')), false, 'corsproxy.io must NOT be called');

    console.log('✅ Test 2 Passed!');

    console.log('--- Test 3: fetchAndExtractSwf with direct SWF URL ---');
    calledUrls.length = 0;

    global.fetch = async (url) => {
        calledUrls.push(url);
        const buffer = new Uint8Array([0x46, 0x57, 0x53, 0x01]).buffer;
        return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer
        };
    };

    const swfRes = await RuffleTouch.fetchAndExtractSwf('http://example.com/testgame.swf');
    assert.strictEqual(swfRes.filename, 'testgame.swf');
    assert.strictEqual(RuffleTouch.isValidSwf(swfRes.data), true);
    assert.strictEqual(swfRes.swfUrl, 'http://example.com/testgame.swf');

    console.log('✅ Test 3 Passed!');

    console.log('--- Test 4: fetchAndExtractSwf with Webpage Scraping ---');
    calledUrls.length = 0;

    const mockHtml = `
        <html>
        <body>
            <embed src="games/mygame.swf" width="800" height="600">
        </body>
        </html>
    `;

    global.fetch = async (url) => {
        calledUrls.push(url);
        if (url.includes('mygame.swf')) {
            const buffer = new Uint8Array([0x43, 0x57, 0x53, 0x01]).buffer;
            return {
                ok: true,
                status: 200,
                arrayBuffer: async () => buffer
            };
        }
        // HTML response
        const htmlBuf = Buffer.from(mockHtml);
        return {
            ok: true,
            status: 200,
            arrayBuffer: async () => htmlBuf
        };
    };

    const pageRes = await RuffleTouch.fetchAndExtractSwf('https://example.com/play-page');
    assert.strictEqual(pageRes.filename, 'mygame.swf');
    assert.strictEqual(pageRes.swfUrl, 'https://example.com/games/mygame.swf');
    assert.strictEqual(RuffleTouch.isValidSwf(pageRes.data), true);

    console.log('✅ Test 4 Passed!');

    console.log('--- Test 5: PWA & Service Worker validation ---');
    const fs = require('fs');

    assert.strictEqual(fs.existsSync('./manifest.webmanifest'), true, 'manifest.webmanifest should exist');
    const manifest = JSON.parse(fs.readFileSync('./manifest.webmanifest', 'utf8'));
    assert.strictEqual(manifest.name, 'Ruffle Touch - Mobile Flash Player');
    assert.strictEqual(manifest.short_name, 'RuffleTouch');
    assert.strictEqual(manifest.start_url, './');
    assert.strictEqual(manifest.scope, './');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.background_color, '#0b0b0e');
    assert.strictEqual(manifest.theme_color, '#0b0b0e');
    assert.strictEqual(Array.isArray(manifest.icons), true);
    assert.strictEqual(manifest.icons.length >= 2, true);

    assert.strictEqual(fs.existsSync('./sw.js'), true, 'sw.js should exist');
    const swContent = fs.readFileSync('./sw.js', 'utf8');
    assert.strictEqual(swContent.includes('ruffle-touch-v1'), true);
    assert.strictEqual(swContent.includes('workers.dev'), true);
    assert.strictEqual(swContent.includes('url='), true);
    assert.strictEqual(swContent.includes('self.clients.claim()'), true);

    assert.strictEqual(fs.existsSync('./index.html'), true, 'index.html should exist');
    const htmlContent = fs.readFileSync('./index.html', 'utf8');
    assert.strictEqual(htmlContent.includes('<link rel="manifest" href="manifest.webmanifest">'), true);
    assert.strictEqual(htmlContent.includes('apple-mobile-web-app-capable'), true);
    assert.strictEqual(htmlContent.includes('sw.js'), true);

    console.log('✅ Test 5 Passed!');

    console.log('--- Test 6: Virtual Gaming Keyboard & Mode Switcher ---');
    // Setup jsdom-like mock environment for Keyboard tests
    const mockEvents = [];
    global.window = {
        dispatchEvent: (evt) => {
            mockEvents.push(evt);
        }
    };
    global.KeyboardEvent = class KeyboardEvent {
        constructor(type, options) {
            this.type = type;
            Object.assign(this, options);
        }
    };
    global.document = {
        createElement: (tag) => {
            const el = {
                tagName: tag.toUpperCase(),
                classList: {
                    classes: new Set(),
                    add: function(c) { this.classes.add(c); },
                    remove: function(c) { this.classes.delete(c); },
                    contains: function(c) { return this.classes.has(c); },
                    toggle: function(c, val) { if (val) this.add(c); else this.remove(c); }
                },
                style: {
                    setProperty: function(prop, val, priority) {
                        this[prop] = val + (priority ? ' !' + priority : '');
                    }
                },
                children: [],
                listeners: {},
                appendChild: function(child) { this.children.push(child); child.parentNode = this; return child; },
                removeChild: function(child) {
                    const idx = this.children.indexOf(child);
                    if (idx !== -1) this.children.splice(idx, 1);
                },
                setAttribute: function(k, v) { this[k] = v; },
                dataset: {},
                getAttribute: function(k) { return this[k] || null; },
                querySelector: function(sel) {
                    if (sel.startsWith('.')) {
                        const className = sel.slice(1);
                        const find = (node) => {
                            if (node.classList && node.classList.contains(className)) return node;
                            if (node.children) {
                                for (const c of node.children) {
                                    const res = find(c);
                                    if (res) return res;
                                }
                            }
                            return null;
                        };
                        return find(this);
                    }
                    return null;
                },
                querySelectorAll: function(sel) {
                    const results = [];
                    if (sel.startsWith('.')) {
                        const className = sel.slice(1);
                        const find = (node) => {
                            if (node.className && node.className.split(' ').includes(className)) results.push(node);
                            if (node.children) {
                                for (const c of node.children) {
                                    find(c);
                                }
                            }
                        };
                        find(this);
                    }
                    return results;
                },
                addEventListener: function(event, fn) {
                    if (!this.listeners[event]) this.listeners[event] = [];
                    this.listeners[event].push(fn);
                },
                dispatchEvent: function(evt) {
                    if (this.listeners[evt.type]) {
                        this.listeners[evt.type].forEach(fn => fn(evt));
                    }
                }
            };
            return el;
        },
        body: {
            children: [],
            appendChild: function(child) { this.children.push(child); child.parentNode = this; },
            addEventListener: function() {}
        }
    };
    global.localStorage = {
        getItem: () => null,
        setItem: () => {}
    };

    const inst = new RuffleTouch({ visible: true });
    assert.strictEqual(inst.inputMode, 'gamepad');
    assert.strictEqual(inst.overlayElement.classList.contains('ruffle-touch-hidden'), false);
    assert.strictEqual(inst.keyboardElement.classList.contains('ruffle-touch-hidden'), true);

    // Test mode switching cycle: gamepad -> mouse -> keyboard -> gamepad
    inst.toggleMode();
    assert.strictEqual(inst.inputMode, 'mouse');
    assert.strictEqual(inst.overlayElement.classList.contains('ruffle-touch-hidden'), true);
    assert.strictEqual(inst.keyboardElement.classList.contains('ruffle-touch-hidden'), true);

    // Verify keyboardDock is appended directly to container and keyboardElement reference
    assert.ok(inst.keyboardDock, 'keyboardDock property should exist');
    assert.strictEqual(inst.keyboardElement, inst.keyboardDock, 'keyboardElement should reference keyboardDock');
    assert.strictEqual(inst.keyboardDock.parentNode, inst.container, 'keyboardDock should be appended directly to container');

    inst.toggleMode();
    assert.strictEqual(inst.inputMode, 'keyboard');
    assert.strictEqual(inst.overlayElement.classList.contains('ruffle-touch-hidden'), true);
    assert.strictEqual(inst.keyboardElement.classList.contains('ruffle-touch-hidden'), false);
    assert.strictEqual(inst.keyboardElement.style.display, 'flex !important');
    assert.strictEqual(inst.keyboardElement.style.visibility, 'visible !important');
    assert.strictEqual(inst.keyboardElement.style.opacity, '1 !important');

    inst.toggleMode();
    assert.strictEqual(inst.inputMode, 'gamepad');

    // Test virtual keyboard layout and key event triggering
    inst.setMode('keyboard', false);
    const keys = inst.keyboardElement.querySelectorAll('.keyboard-key');
    assert.strictEqual(keys.length, 44, 'Virtual keyboard should contain 44 keys across 4 rows');

    // Find Space key button
    const spaceBtn = keys.find(k => k.textContent === 'Space');
    assert.ok(spaceBtn, 'Space key button should exist');

    mockEvents.length = 0;
    const preventDefaultCalled = [];
    const dummyEvent = {
        type: 'pointerdown',
        preventDefault: () => preventDefaultCalled.push('preventDefault'),
        stopPropagation: () => {}
    };
    spaceBtn.dispatchEvent(dummyEvent);

    assert.strictEqual(preventDefaultCalled.length, 1, 'pointerdown preventDefault should be called to prevent focus loss');
    assert.strictEqual(mockEvents.length, 1, 'One keydown event should be dispatched');
    assert.strictEqual(mockEvents[0].type, 'keydown');
    assert.strictEqual(mockEvents[0].key, ' ');
    assert.strictEqual(mockEvents[0].code, 'Space');
    assert.strictEqual(mockEvents[0].keyCode, 32);

    // Release key
    const releaseEvent = {
        type: 'pointerup',
        preventDefault: () => {},
        stopPropagation: () => {}
    };
    spaceBtn.dispatchEvent(releaseEvent);
    assert.strictEqual(mockEvents.length, 2, 'One keyup event should be dispatched');
    assert.strictEqual(mockEvents[1].type, 'keyup');
    assert.strictEqual(mockEvents[1].key, ' ');
    assert.strictEqual(mockEvents[1].code, 'Space');
    assert.strictEqual(mockEvents[1].keyCode, 32);

    console.log('✅ Test 6 Passed!');


    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
