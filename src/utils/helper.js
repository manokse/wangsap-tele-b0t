const config = require('../config');
const { Jimp, loadFont, measureText, BlendMode } = require('jimp');
const _jimpFontsPath = require('path').join(require.resolve('jimp').replace(/dist[/\\].*/, ''), 'dist', 'commonjs', 'fonts.js');
const { SANS_32_WHITE, SANS_16_WHITE } = require(_jimpFontsPath);

/**
 * Helper utilities untuk Telegram Bot
 */

// Rate limiter storage
const rateLimitMap = new Map();

/**
 * Format angka ke format Rupiah
 */
function formatRupiah(amount) {
    return 'Rp ' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Format tanggal
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Validasi NIK (16 digit)
 */
function isValidNIK(nik) {
    if (!nik) return false;
    const cleanNik = nik.replace(/\D/g, '');
    return cleanNik.length === 16;
}

/**
 * Validasi nomor KK (16 digit)
 */
function isValidKK(kk) {
    if (!kk) return false;
    const cleanKk = kk.replace(/\D/g, '');
    return cleanKk.length === 16;
}

/**
 * Check if user is owner
 */
function isOwner(userId) {
    return config.isOwner(userId);
}

/**
 * Rate limiter
 */
const rateLimiter = {
    check(userId, maxRequests = 30, windowMs = 60000) {
        const key = String(userId);
        const now = Date.now();
        
        if (!rateLimitMap.has(key)) {
            rateLimitMap.set(key, { count: 1, startTime: now });
            return true;
        }
        
        const data = rateLimitMap.get(key);
        
        if (now - data.startTime > windowMs) {
            rateLimitMap.set(key, { count: 1, startTime: now });
            return true;
        }
        
        if (data.count >= maxRequests) {
            return false;
        }
        
        data.count++;
        return true;
    }
};

/**
 * Delay function
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Escape HTML characters
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Sanitize error message to prevent exposing server/API details
 * @param {string|Error} error - Error message or Error object
 * @returns {string} - Sanitized error message safe for users
 */
function sanitizeErrorMessage(error) {
    const errorStr = typeof error === 'string' ? error : (error?.message || 'Unknown error');
    
    // Patterns that expose sensitive info
    const sensitivePatterns = [
        /https?:\/\/[^\s]+/gi,                    // URLs
        /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP addresses
        /api[_-]?key[=:]?\s*[\w-]+/gi,            // API keys
        /token[=:]?\s*[\w-]+/gi,                   // Tokens
        /password[=:]?\s*[\w-]+/gi,               // Passwords
        /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNABORTED|ECONNRESET/gi, // Node errors
        /Error:\s*connect\s+/gi,                  // Connection errors
        /at\s+[\w\.]+\s*\([^)]+\)/g,              // Stack traces
        /\/[\w\/\.]+\.js:\d+:\d+/g,               // File paths with line numbers
        /localhost|127\.0\.0\.1/gi,               // Localhost references
        /port\s*\d+/gi,                           // Port numbers
        /apikey=[\w-]+/gi,                        // API key params
        /Authorization:\s*[^\s]+/gi,             // Auth headers
    ];
    
    let sanitized = errorStr;
    
    // Replace sensitive patterns
    for (const pattern of sensitivePatterns) {
        sanitized = sanitized.replace(pattern, '[HIDDEN]');
    }
    
    // Map common technical errors to user-friendly messages
    const errorMappings = {
        '[HIDDEN]': 'Terjadi kesalahan koneksi',
        'ECONNREFUSED': 'Server sedang tidak dapat dijangkau',
        'ENOTFOUND': 'Server tidak ditemukan',
        'ETIMEDOUT': 'Request timeout, silakan coba lagi',
        'ECONNABORTED': 'Koneksi terputus, silakan coba lagi',
        'ECONNRESET': 'Koneksi direset, silakan coba lagi',
        'socket hang up': 'Koneksi terputus',
        'network error': 'Gangguan jaringan',
        'request failed': 'Permintaan gagal',
        '500': 'Server sedang mengalami masalah',
        '502': 'Server sedang tidak tersedia',
        '503': 'Layanan sedang tidak tersedia',
        '504': 'Server timeout',
        '401': 'Autentikasi gagal',
        '403': 'Akses ditolak',
        '404': 'Data tidak ditemukan',
        '429': 'Terlalu banyak permintaan, coba lagi nanti',
    };
    
    // Check if entire message is just [HIDDEN]
    if (sanitized.trim() === '[HIDDEN]' || sanitized.includes('[HIDDEN]')) {
        for (const [key, value] of Object.entries(errorMappings)) {
            if (errorStr.toLowerCase().includes(key.toLowerCase())) {
                return value;
            }
        }
        return 'Terjadi kesalahan sistem, silakan coba lagi';
    }
    
    // If message is too technical, replace entirely
    if (sanitized.length > 100 || /[{}<>\[\]]/g.test(sanitized)) {
        return 'Terjadi kesalahan sistem, silakan coba lagi';
    }
    
    return sanitized;
}

/**
 * Censor NIK (tampilkan sebagian)
 */
function censorNIK(nik) {
    if (!nik || nik.length < 16) return nik;
    return nik.slice(0, 6) + '******' + nik.slice(-4);
}

/**
 * Censor nama (tampilkan sebagian)
 */
function censorName(name) {
    if (!name || name.length < 3) return name;
    const words = name.split(' ');
    return words.map(word => {
        if (word.length <= 2) return word;
        return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
    }).join(' ');
}

/**
 * Generate random string
 */
function generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Parse command arguments
 */
function parseArgs(text) {
    if (!text) return [];
    return text.trim().split(/\s+/).filter(arg => arg.length > 0);
}

/**
 * Get user display name from Telegram message
 */
function getUserDisplayName(from) {
    if (from.first_name && from.last_name) {
        return `${from.first_name} ${from.last_name}`;
    }
    return from.first_name || from.username || 'User';
}

/**
 * Add diagonal tiled watermark to an image buffer.
 * Watermark text = WATERMARK_TEXT from .env + user ID.
 */
let _fontCache = null;
async function addWatermark(imageBuffer, userId) {
    try {
        const image = await Jimp.read(imageBuffer);
        const w = image.width;
        const h = image.height;

        // Pick font based on image size
        const useSmall = w < 300 || h < 300;
        if (!_fontCache) _fontCache = {};
        const fontKey = useSmall ? 'sm' : 'lg';
        if (!_fontCache[fontKey]) {
            _fontCache[fontKey] = await loadFont(useSmall ? SANS_16_WHITE : SANS_32_WHITE);
        }
        const font = _fontCache[fontKey];
        const fontH = useSmall ? 16 : 32;

        // Compose the text: custom label from .env + tracking ID
        const label = (config.watermarkText || 'CONFIDENTIAL').trim();
        const wmText = `${label}  ${userId}`;

        // Measure text width so tile fits exactly
        const textW = measureText(font, wmText);
        const padX = useSmall ? 16 : 28;
        const padY = useSmall ? 8 : 14;
        const tileW = textW + padX * 2;
        const tileH = fontH + padY * 2;

        // Create tile: transparent bg, white text
        const tile = new Jimp({ width: tileW, height: tileH, color: 0x00000000 });
        tile.print({ font, x: padX, y: padY, text: wmText });

        // Rotate -30 degrees (Jimp rotate = counter-clockwise, so 330 = -30)
        tile.rotate(330);
        const rotW = tile.width;
        const rotH = tile.height;

        // Gap between tiled repetitions
        const gapX = useSmall ? 20 : 40;
        const gapY = useSmall ? 16 : 30;
        const stepX = rotW + gapX;
        const stepY = rotH + gapY;

        // Tile diagonally across entire image
        for (let row = -1; row * stepY < h + rotH; row++) {
            // Stagger odd rows by half stepX for a proper diagonal grid
            const offsetX = (row % 2 !== 0) ? Math.floor(stepX / 2) : 0;
            for (let col = -1; col * stepX < w + rotW; col++) {
                const px = col * stepX + offsetX - Math.floor(rotW / 2);
                const py = row * stepY - Math.floor(rotH / 2);
                image.composite(tile, px, py, {
                    mode: BlendMode.SRC_OVER,
                    opacitySource: 0.38,
                    opacityDest: 1
                });
            }
        }

        return await image.getBuffer('image/jpeg');
    } catch (err) {
        console.error('Watermark error:', err.message);
        return imageBuffer;
    }
}

module.exports = {
    formatRupiah,
    formatDate,
    isValidNIK,
    isValidKK,
    isOwner,
    rateLimiter,
    delay,
    escapeHtml,
    sanitizeErrorMessage,
    censorNIK,
    censorName,
    generateRandomString,
    parseArgs,
    getUserDisplayName,
    addWatermark
};
