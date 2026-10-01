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

    assert.strictEqual(calledUrls.length, 3, 'Should attempt 3 proxy URLs');
    assert.strictEqual(calledUrls[0], 'https://direct-fail.com/game.swf', 'Step 1: Direct fetch');
    assert.strictEqual(calledUrls[1], `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, 'Step 2: allorigins');
    assert.strictEqual(calledUrls[2], `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, 'Step 3: codetabs');
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

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
