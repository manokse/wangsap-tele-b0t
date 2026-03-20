const axios = require('axios');
const config = require('../config');
const db = require('../database');

/**
 * ASEX Vehicle API Service - Updated
 * Direct response API (no callback/polling)
 * 
 * Endpoints:
 * - NOPOL:  https://asexapi.cloud/api/nopol/?api_key=XXX&plate=XXX
 * - NOKA:   https://asexapi.cloud/api/nopol/?api_key=XXX&no_rangka=XXX
 * - NOSIN:  https://asexapi.cloud/api/nopol/?api_key=XXX&no_mesin=XXX
 * - NIKPLAT: https://asexapi.cloud/api/nopol/?api_key=XXX&no_ktp=XXX
 */
class AsexVehicleService {
    constructor() {
        this.activePolls = new Map();
    }

    getApiKey() {
        const settings = db.getAllSettings();
        return settings.asex_api_key || config.asexApiKey;
    }

    getBaseUrl() {
        return 'https://asexapi.cloud/api/nopol/';
    }

    getQueryParam(type) {
        return {
            nopol: 'plate',
            noka: 'no_rangka',
            nosin: 'no_mesin',
            nikplat: 'no_ktp'
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

        // Normalize plate number - ASEX often returns plate_number directly
        normalized.plate_number = data.plate_number || data.plat_nomor || data.no_polisi || data.nomor_polisi;
        
        if (!normalized.plate_number || normalized.plate_number === '-') {
            const wilayah = data.wilayah || data.SeriWilayah || '';
            const nopol = data.nopol || data.Nopol || '';
            const seri = data.seri || data.Seri || '';
            normalized.plate_number = [wilayah, nopol, seri].filter(Boolean).join(' ').trim() || '-';
        }

        // Map field variations to standard names
        normalized.merk = data.merk || data.Merk || data.brand || data.Brand || data.merek || '-';
        normalized.type_model = data.type_model || data.Type || data.type || data.model || data.Model || data.tipe || '-';
        normalized.model = data.model || data.Model || data.model_kendaraan || '-';
        normalized.tahun_pembuatan = data.tahun_pembuatan || data.TahunPembuatan || data.tahun || data.Tahun || data.thn_buat || '-';
        normalized.warna = data.warna || data.Warna || data.color || data.Color || data.warna_kbli || '-';
        normalized.isi_silinder = data.isi_silinder || data.IsiCylinder || data.cc || data.CC || data.isi_silinder_cc || '-';
        normalized.jumlah_roda = data.jumlah_roda || data.JumlahRoda || data.jml_roda || '-';

        normalized.no_rangka = data.no_rangka || data.NoRangka || data.nomor_rangka || '-';
        normalized.no_mesin = data.no_mesin || data.NoMesin || data.nomor_mesin || '-';
        normalized.no_bpkb = data.no_bpkb || data.NoBPKB || data.nomor_bpkb || '-';
        normalized.no_stnk = data.no_stnk || data.NoSTNK || data.nomor_stnk || '-';
        normalized.no_faktur = data.no_faktur || data.NoFaktur || '-';
        normalized.tanggal_daftar = data.tanggal_daftar || data.TanggalDaftar || data.tgl_daftar || '-';

        normalized.nama_pemilik = data.nama_pemilik || data.NamaPemilik || data.nama || data.Nama || '-';
        normalized.no_ktp = data.no_ktp || data.NoKTP || data.nik || data.NIK || data.no_ktp_pemilik || '-';
        normalized.no_kk = data.no_kk || data.NoKK || '-';
        normalized.no_hp = data.no_hp || data.NoHP || data.hp || data.HP || '-';
        normalized.pekerjaan = data.pekerjaan || data.Pekerjaan || '-';
        normalized.alamat = data.alamat || data.Alamat || '-';
        normalized.provinsi = data.provinsi || data.Provinsi || '-';
        normalized.polda = data.polda || data.Polda || '-';

        return normalized;
    }

    /**
     * Direct lookup - no callback/polling
     * Note: API takes ~30 seconds to respond
     */
    async lookup(type, value) {
        const paramName = this.getQueryParam(type);
        if (!paramName) {
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
            const url = `${this.getBaseUrl()}?api_key=${this.getApiKey()}&${paramName}=${encodeURIComponent(normalizedValue)}`;

            console.log(`[ASEX Vehicle] ${type.toUpperCase()}: ${normalizedValue}`);

            const response = await axios.get(url, {
                timeout: 90000, // 90 seconds timeout (API takes ~30s)
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data || {};

            // Check if status is false (data not found)
            if (data.status === false) {
                return {
                    success: false,
                    error: data.message || 'Data kendaraan tidak ditemukan',
                    refund: true
                };
            }

            // Check if status is true and data exists
            if (data.status === true && data.data) {
                // Normalize the response data to match formatter expectations
                const normalizedData = this.normalizeData(data.data);

                return {
                    success: true,
                    data: normalizedData,
                    source: 'asexapi',
                    refund: false
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
                message = 'Akses API kendaraan ditolak';
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

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new AsexVehicleService();
