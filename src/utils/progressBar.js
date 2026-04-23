/**
 * Progress bar utility for massal operations
 * Inspired by bot-tele-2fitur spinner + progress bar style
 */

const SPINNER_FRAMES = ['🚀', '⚡', '🔄', '🛰️', '⏳'];

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

/**
 * Build progress text for WhatsApp (markdown)
 */
function buildProgressWA({ title, frame, processed, total, success, failed, costCount, elapsedMs }) {
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    const barSize = 12;
    const filled = Math.max(0, Math.min(barSize, Math.round((percent / 100) * barSize)));
    const bar = `${'█'.repeat(filled)}${'░'.repeat(barSize - filled)}`;

    let etaText = '-';
    if (processed > 0 && processed < total) {
        const avgMs = elapsedMs / processed;
        etaText = formatDuration(avgMs * (total - processed));
    } else if (processed >= total) {
        etaText = 'Selesai!';
    }

    return `${frame} *${title}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💳 Cost: *${costCount} token*\n` +
        `📦 Progress: *${processed}/${total}* (${percent}%)\n` +
        `📊 ${bar}\n` +
        `✅ Sukses: *${success}*  |  ❌ Gagal: *${failed}*\n` +
        `⏱️ Elapsed: *${formatDuration(elapsedMs)}*  |  ETA: *${etaText}*`;
}

/**
 * Build progress text for Telegram (HTML)
 */
function buildProgressTG({ title, frame, processed, total, success, failed, costCount, elapsedMs }) {
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    const barSize = 12;
    const filled = Math.max(0, Math.min(barSize, Math.round((percent / 100) * barSize)));
    const bar = `${'█'.repeat(filled)}${'░'.repeat(barSize - filled)}`;

    let etaText = '-';
    if (processed > 0 && processed < total) {
        const avgMs = elapsedMs / processed;
        etaText = formatDuration(avgMs * (total - processed));
    } else if (processed >= total) {
        etaText = 'Selesai!';
    }

    return `${frame} <b>${title}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💳 Cost: <b>${costCount} token</b>\n` +
        `📦 Progress: <b>${processed}/${total}</b> (${percent}%)\n` +
        `📊 ${bar}\n` +
        `✅ Sukses: <b>${success}</b>  |  ❌ Gagal: <b>${failed}</b>\n` +
        `⏱️ Elapsed: <b>${formatDuration(elapsedMs)}</b>  |  ETA: <b>${etaText}</b>`;
}

function getSpinnerFrame(index) {
    return SPINNER_FRAMES[index % SPINNER_FRAMES.length];
}

module.exports = { buildProgressWA, buildProgressTG, getSpinnerFrame, formatDuration, SPINNER_FRAMES };
