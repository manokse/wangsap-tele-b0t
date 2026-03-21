const axios = require('axios');
const config = require('../config');
const db = require('../database');

/**
 * ASEX Vehicle API Service - Telegram Bot
 * 
 * Endpoints:
 * - NOPOL:  https://apiv3.asexapi.cloud/nopol/?api_key=XXX&q=F6347ubi
 * - NOKA:   https://apiv3.asexapi.cloud/noka/?api_key=XXX&NoRangka=MH1JM3136KK103959
 * - NOSIN:  https://apiv3.asexapi.cloud/nosin/?api_key=XXX&NoMesin=JM31E3099166
 * - NIKPLAT: https://apiv3.asexapi.cloud/pemilik/?api_key=XXX&NoKTP=3202164401900007
 * 
 * Example Response:
 * {
 *   "status": true,
 *   "query": "F6347ubi",
 *   "used_today": 11,
 *   "limit": 1000,
 *   "data": [{ ... }]
 * }
 */
class AsexVehicleService {
    constructor() {
        this.baseUrls = {
            nopol: 'https://apiv3.asexapi.cloud/nopol/',
            noka: 'https://apiv3.asexapi.cloud/noka/',
            nosin: 'https://apiv3.asexapi.cloud/nosin/',
            nikplat: 'https://apiv3.asexapi.cloud/pemilik/'
        };
    }

    getApiKey() {
        const settings = db.getAllSettings();
        return settings.asex_api_key || config.asexApiKey;
    }

    /**
     * Get API endpoint URL based on lookup type
     */
    getEndpoint(type) {
        return this.baseUrls[type];
    }

    /**
     * Get API query parameter name based on lookup type
     */
    getQueryParam(type) {
        return {
            nopol: 'q',
            noka: 'NoRangka',
            nosin: 'NoMesin',
            nikplat: 'NoKTP'
        }[type];
    }

    /**
     * Normalize nopol input - remove spaces and uppercase
     * Examples: "A 8073 XA" -> "A8073XA", "a8073xa" -> "A8073XA"
     */
    normalizeNopol(value) {
        return value.replace(/\s+/g, '').toUpperCase();
    }

    /**
     * Normalize vehicle data from ASEX API to match formatter expectations
     * Maps various field name variations to standard format
     */
    normalizeData(data) {
        if (!data) return data;

        // Create normalized copy
        const normalized = { ...data };

        // Helper to check if value is meaningful (not null, undefined, empty, or "0" or "-")
        const hasValue = (val) => val != null && val !== '' && val !== '0' && val !== '-';

        // Plate number - combine wilayah, nopol, seri
        const wilayah = data.wilayah || '';
        const nopol = data.nopol || '';
        const seri = data.seri || '';
        
        if (hasValue(wilayah) || hasValue(nopol) || hasValue(seri)) {
            normalized.plate_number = [wilayah, nopol, seri].filter(hasValue).join(' ').trim();
        } else {
            normalized.plate_number = data.plate_number || data.plat_nomor || '-';
        }

        // Map field variations from ASEX API response
        normalized.wilayah = hasValue(data.wilayah) ? data.wilayah : '-';
        normalized.nopol = hasValue(data.nopol) ? data.nopol : '-';
        normalized.seri = hasValue(data.seri) ? data.seri : '-';
        
        normalized.merk = hasValue(data.Merk) ? data.Merk : (hasValue(data.merk) ? data.merk : '-');
        normalized.type_model = hasValue(data.Type) ? data.Type : (hasValue(data.type) ? data.type : '-');
        normalized.model = hasValue(data.Model) ? data.Model : '-';
        normalized.tahun_pembuatan = hasValue(data.TahunPembuatan) ? data.TahunPembuatan : (hasValue(data.tahun) ? data.tahun : '-');
        normalized.warna = hasValue(data.Warna) ? data.Warna : (hasValue(data.warna) ? data.warna : '-');
        normalized.isi_silinder = hasValue(data.IsiCylinder) ? data.IsiCylinder : (hasValue(data.cc) ? data.cc : '-');
        normalized.jumlah_roda = hasValue(data.JumlahRoda) ? data.JumlahRoda : (hasValue(data.jml_roda) ? data.jml_roda : '-');

        normalized.no_rangka = hasValue(data.NoRangka) ? data.NoRangka : (hasValue(data.no_rangka) ? data.no_rangka : '-');
        normalized.no_mesin = hasValue(data.NoMesin) ? data.NoMesin : (hasValue(data.no_mesin) ? data.no_mesin : '-');
        normalized.no_bpkb = hasValue(data.NoBPKB) ? data.NoBPKB : '-';
        normalized.no_stnk = hasValue(data.NoSTNK) ? data.NoSTNK : '-';
        normalized.no_faktur = hasValue(data.NoFaktur) && data.NoFaktur !== '0' ? data.NoFaktur : '-';
        normalized.tanggal_daftar = hasValue(data.TanggalDaftar) ? data.TanggalDaftar : '-';

        // Owner info
        normalized.nama_pemilik = hasValue(data.NamaPemilik) ? data.NamaPemilik : (hasValue(data.nama) ? data.nama : '-');
        normalized.no_ktp = hasValue(data.NoKTP) ? data.NoKTP : (hasValue(data.nik) ? data.nik : '-');
        normalized.no_kk = hasValue(data.NoKK) ? data.NoKK : '-';
        normalized.no_hp = hasValue(data.NoHP) ? data.NoHP : '-';
        normalized.email = hasValue(data.Email) ? data.Email : '-';
        normalized.pekerjaan = hasValue(data.Pekerjaan) ? data.Pekerjaan : '-';
        normalized.alamat = hasValue(data.alamat) ? data.alamat : '-';
        normalized.rt = hasValue(data.RT) ? data.RT : '-';
        normalized.rw = hasValue(data.RW) ? data.RW : '-';
        normalized.kode_provinsi = hasValue(data.KodeProvinsi) ? data.KodeProvinsi : '-';
        normalized.kode_kelurahan = hasValue(data.KodeKel) ? data.KodeKel : '-';
        normalized.polda = hasValue(data.polda) ? data.polda : '-';

        return normalized;
    }

    /**
     * Direct lookup - no callback/polling
     */
    async lookup(type, value) {
        const endpoint = this.getEndpoint(type);
        const queryParam = this.getQueryParam(type);
        
        if (!endpoint || !queryParam) {
            return {
                success: false,
                error: 'Tipe pencarian kendaraan tidak valid',
                refund: true
            };
        }

        // Normalize input value (especially for nopol)
        let normalizedValue = value;
        if (type === 'nopol') {
            normalizedValue = this.normalizeNopol(value);
            console.log(`[ASEX] Normalized nopol: "${value}" -> "${normalizedValue}"`);
        }

        try {
            const url = `${endpoint}?api_key=${this.getApiKey()}&${queryParam}=${encodeURIComponent(normalizedValue)}`;

            console.log(`[ASEX Vehicle] ${type.toUpperCase()}: ${normalizedValue}`);

            const response = await axios.get(url, {
                timeout: 60000, // 60 seconds timeout
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data || {};

            // Check if status is false (data not found or error)
            if (data.status === false) {
                return {
                    success: false,
                    error: data.message || 'Data kendaraan tidak ditemukan',
                    refund: true
                };
            }

            // Check if status is true and data exists
            if (data.status === true && data.data && Array.isArray(data.data) && data.data.length > 0) {
                // Normalize ALL results - support multiple vehicles
                const normalizedData = data.data.map(item => this.normalizeData(item));

                return {
                    success: true,
                    data: normalizedData, // Return array of all vehicles
                    total: data.data.length,
                    source: 'asexapi',
                    quota: {
                        used_today: data.used_today || 0,
                        limit: data.limit || 1000
                    },
                    refund: false
                };
            }

            // Data array empty
            if (data.status === true && (!data.data || !Array.isArray(data.data) || data.data.length === 0)) {
                return {
                    success: false,
                    error: 'Data kendaraan tidak ditemukan',
                    refund: true
                };
            }

            // Fallback for unexpected response
            console.warn('[ASEX] Unexpected response:', data);
            return {
                success: false,
                error: 'Format response tidak valid',
                refund: true
            };

        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * Alias for lookup() for backward compatibility
     */
    async submitLookup(type, value) {
        return this.lookup(type, value);
    }

    /**
     * Handle API errors
     */
    handleError(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return {
                success: false,
                error: 'Request timeout, silakan coba lagi',
                refund: true
            };
        }

        if (error.response) {
            let message = 'Server kendaraan sedang bermasalah';
            
            if (error.response.status === 401 || error.response.status === 403) {
                message = 'Akses API kendaraan ditolak (API Key invalid)';
            } else if (error.response.status === 429) {
                message = 'API kendaraan terlalu sibuk, coba lagi nanti';
            } else if (error.response.status === 404) {
                message = 'Data kendaraan tidak ditemukan';
            }

            return {
                success: false,
                error: message,
                refund: true
            };
        }

        return {
            success: false,
            error: 'Gagal menghubungi server kendaraan',
            refund: true
        };
    }
}

module.exports = new AsexVehicleService();
