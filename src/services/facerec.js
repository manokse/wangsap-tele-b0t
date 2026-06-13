const axios = require('axios');
const FormData = require('form-data');

const FACEREC_API_URL = process.env.FACEREC_API_URL || 'https://access.babyoctopus.ngrok.dev/search';
const FACEREC_API_KEY = process.env.FACEREC_API_KEY || '';

class FaceRecService {
    constructor() {}

    async uploadToTmpfiles(imageBuffer, filename = 'photo.jpg') {
        const form = new FormData();
        form.append('file', imageBuffer, { filename });
        form.append('expire', '86400');

        const response = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 30000
        });

        const data = response.data;
        if (!data || data.status !== 'success' || !data.data?.url) {
            throw new Error('Gagal upload gambar ke tmpfiles.org');
        }

        const originalUrl = data.data.url;
        const downloadUrl = originalUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');

        return downloadUrl;
    }

    async search(imageBuffer) {
        try {
            console.log('[FACEREC] Uploading image to tmpfiles.org...');
            const imageUrl = await this.uploadToTmpfiles(imageBuffer);
            console.log(`[FACEREC] Image uploaded: ${imageUrl}`);

            console.log('[FACEREC] Sending to Face Recognition API...');
            const response = await axios.post(FACEREC_API_URL, {
                url: imageUrl
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': FACEREC_API_KEY
                },
                timeout: 60000
            });

            const payload = response.data;

            if (!payload || payload.status !== 'ok') {
                return {
                    success: false,
                    error: payload?.message || 'Tidak ada hasil dari Face Recognition API',
                    refund: true
                };
            }

            if (!payload.candidates || payload.candidates.length === 0) {
                return {
                    success: false,
                    error: 'Wajah tidak dikenali. Tidak ada kandidat yang cocok.',
                    refund: true
                };
            }

            console.log(`[FACEREC] SUCCESS - Found ${payload.total} candidate(s)`);
            return {
                success: true,
                data: payload.candidates,
                total: payload.total,
                refund: false
            };

        } catch (error) {
            console.error('[FACEREC] Error:', error.message);

            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                return {
                    success: false,
                    error: 'Request timeout - Server Face Recognition tidak merespon',
                    refund: true
                };
            }

            return {
                success: false,
                error: error.message || 'Terjadi kesalahan sistem',
                refund: true
            };
        }
    }
}

module.exports = new FaceRecService();
