/**
 * BPJS Ketenagakerjaan API Service
 * Supports NIK (auto lookup via securetrack.id) and KPJ (direct search)
 * 
 * NIK flow:  NIK → securetrack.id (get nama & tglLahir) → BPJSTK /api/search?nik=...
 * KPJ flow:  KPJ → BPJSTK /api/search/kpj?kpj=...
 * 
 * NIK API: https://securetrack.id/server/ceknik.php?nik=XXX
 * BPJSTK NIK API: http://38.49.208.151:3540/api/search?nik=XXX&apikey=YYY&nama=XXX&tglLahir=XX-XX-XXXX
 * BPJSTK KPJ API: http://38.49.208.151:3540/api/search/kpj?kpj=XXX&apikey=YYY
 */

const axios = require('axios');

// API Configuration
const NIK_API_URL = 'https://securetrack.id/server/ceknik.php';
const BPJSTK_NIK_URL = 'http://38.49.208.151:3540/api/search';
const BPJSTK_KPJ_URL = 'http://38.49.208.151:3540/api/search/kpj';
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
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const payload = response.data;

        if (!payload || !payload.success || !payload.data) {
            return {
                success: false,
                error: payload?.message || 'Data NIK tidak ditemukan'
            };
        }

        const d = payload.data;
        // Format tanggal lahir dari YYYY-MM-DD ke DD-MM-YYYY
        let tglLahir = '';
        if (d.tgl_lahir) {
            const parts = d.tgl_lahir.split('-');
            if (parts.length === 3) {
                tglLahir = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                tglLahir = d.tgl_lahir;
            }
        }

        console.log(`[BPJSTK] NIK data found: ${d.nama || d.nama_lengkap_user}, tglLahir: ${tglLahir}`);

        return {
            success: true,
            nama: d.nama || d.nama_lengkap_user || '',
            tglLahir: tglLahir,
            data: d
        };
    }

    /**
     * Step 2: Hit BPJSTK API with nik, nama, tglLahir
     */
    async searchBPJSTK(nik, nama, tglLahir) {
        const cleanNik = String(nik || '').replace(/\D/g, '');
        const url = `${BPJSTK_NIK_URL}?nik=${encodeURIComponent(cleanNik)}&apikey=${encodeURIComponent(BPJSTK_API_KEY)}&nama=${encodeURIComponent(nama)}&tglLahir=${encodeURIComponent(tglLahir)}`;

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

    /**
     * Check BPJS Ketenagakerjaan by KPJ (direct search)
     * No need to fetch NIK data first
     */
    async checkByKPJ(kpj) {
        const cleanKpj = String(kpj || '').replace(/\D/g, '');
        console.log(`[BPJSTK] Checking KPJ: ${cleanKpj}`);

        try {
            const url = `${BPJSTK_KPJ_URL}?kpj=${encodeURIComponent(cleanKpj)}&apikey=${encodeURIComponent(BPJSTK_API_KEY)}`;

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
                    error: payload.message || 'Data BPJS TK tidak ditemukan untuk KPJ tersebut.',
                    refund: true
                };
            }

            if (payload.status === 'success' && payload.data && payload.data.length > 0) {
                console.log(`[BPJSTK] KPJ SUCCESS - Found ${payload.count || payload.data.length} record(s) ${payload.cached ? '(cached)' : ''}`);
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

        } catch (error) {
            console.error('[BPJSTK] KPJ Error:', error.message);

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

    /**
     * Main entry point: auto-detect NIK (16 digit) vs KPJ
     */
    async check(input) {
        const clean = String(input || '').replace(/\D/g, '');
        if (clean.length === 16) {
            return await this.checkByNIK(clean);
        } else {
            return await this.checkByKPJ(clean);
        }
    }
}

module.exports = new BPJSTKService();
