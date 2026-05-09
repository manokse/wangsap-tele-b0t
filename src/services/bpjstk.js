/**
 * BPJS Ketenagakerjaan API Service
 * Flow: NIK → hit NIK API (get nama & tglLahir) → hit BPJSTK API
 * 
 * NIK API: https://151.240.0.241/api_nik.php?nik=XXX
 * BPJSTK API: http://38.49.208.151:3540/api/search?nik=XXX&apikey=YYY&nama=XXX&tglLahir=XX-XX-XXXX
 */

const axios = require('axios');
const https = require('https');

// HTTPS Agent (SSL verify false)
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    timeout: 120000,
});

// API Configuration
const NIK_API_URL = 'https://151.240.0.241/api_nik.php';
const BPJSTK_API_URL = 'http://38.49.208.151:3540/api/search';
const BPJSTK_API_KEY = process.env.BPJSTK_API_KEY || 'bpjstk_f6f0baf41e1a4fb3fc916ba489041639e3caf5390fd482b0';

class BPJSTKService {
    constructor() {}

    /**
     * Step 1: Get nama & tglLahir from NIK API
     */
    async fetchNIKData(nik) {
        const cleanNik = String(nik || '').replace(/\D/g, '');
        const url = `${NIK_API_URL}?nik=${encodeURIComponent(cleanNik)}`;

        console.log(`[BPJSTK] Fetching NIK data: ${cleanNik}`);

        const response = await axios.get(url, {
            httpsAgent,
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const payload = response.data;

        if (!payload || payload.error === true || !payload.data) {
            return {
                success: false,
                error: payload?.message || 'Data NIK tidak ditemukan'
            };
        }

        const d = payload.data;
        // Format tanggal lahir dari YYYY-MM-DD ke DD-MM-YYYY
        let tglLahir = '';
        if (d.tanggal_lahir) {
            const parts = d.tanggal_lahir.split('-');
            if (parts.length === 3) {
                tglLahir = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                tglLahir = d.tanggal_lahir;
            }
        }

        console.log(`[BPJSTK] NIK data found: ${d.nama_lengkap}, tglLahir: ${tglLahir}`);

        return {
            success: true,
            nama: d.nama_lengkap || '',
            tglLahir: tglLahir,
            data: d
        };
    }

    /**
     * Step 2: Hit BPJSTK API with nik, nama, tglLahir
     */
    async searchBPJSTK(nik, nama, tglLahir) {
        const cleanNik = String(nik || '').replace(/\D/g, '');
        const url = `${BPJSTK_API_URL}?nik=${encodeURIComponent(cleanNik)}&apikey=${encodeURIComponent(BPJSTK_API_KEY)}&nama=${encodeURIComponent(nama)}&tglLahir=${encodeURIComponent(tglLahir)}`;

        console.log(`[BPJSTK] Searching BPJSTK: ${cleanNik}, ${nama}, ${tglLahir}`);

        const response = await axios.get(url, {
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const payload = response.data;

        if (!payload) {
            return {
                success: false,
                error: 'Tidak ada response dari server BPJSTK',
                refund: true
            };
        }

        if (payload.status === 'not_found') {
            return {
                success: false,
                error: payload.message || 'NIK terverifikasi namun data kepesertaan BPJS TK tidak tersedia.',
                refund: true
            };
        }

        if (payload.status === 'success' && payload.data && payload.data.length > 0) {
            console.log(`[BPJSTK] SUCCESS - Found ${payload.count || payload.data.length} record(s) ${payload.cached ? '(cached)' : ''}`);
            return {
                success: true,
                data: payload.data,
                raw: payload.raw || null,
                count: payload.count || payload.data.length,
                cached: payload.cached || false,
                response_time_ms: payload.response_time_ms || null
            };
        }

        return {
            success: false,
            error: payload.message || 'Data BPJS Ketenagakerjaan tidak ditemukan.',
            refund: true
        };
    }

    /**
     * Check BPJS Ketenagakerjaan by NIK (main entry point)
     * Flow: NIK → get nama/tglLahir → search BPJSTK
     */
    async checkByNIK(nik) {
        console.log(`[BPJSTK] Checking NIK: ${nik}`);

        try {
            // Step 1: Get nama & tglLahir from NIK API
            const nikResult = await this.fetchNIKData(nik);

            if (!nikResult.success) {
                return {
                    success: false,
                    error: `Gagal mengambil data NIK: ${nikResult.error}`,
                    refund: true
                };
            }

            if (!nikResult.nama || !nikResult.tglLahir) {
                return {
                    success: false,
                    error: 'Data nama/tanggal lahir tidak tersedia dari NIK.',
                    refund: true
                };
            }

            // Step 2: Search BPJSTK
            const result = await this.searchBPJSTK(nik, nikResult.nama, nikResult.tglLahir);
            return result;

        } catch (error) {
            console.error('[BPJSTK] Error:', error.message);

            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                return {
                    success: false,
                    error: 'Request timeout - Server BPJSTK tidak merespon',
                    refund: true
                };
            }

            if (error.response?.status === 403) {
                return {
                    success: false,
                    error: 'Akses diblokir. Silakan coba lagi nanti.',
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

module.exports = new BPJSTKService();
