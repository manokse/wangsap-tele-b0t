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

        // Helper to check if value is meaningful (not null, undefined, empty, or "0" or "-")
        const hasValue = (val) => val != null && val !== '' && val !== '0' && val !== '-';

        // Normalize plate number - ASEX returns parts: plate_region, plate_number, plate_series
        const region = data.plate_region || data.wilayah || '';
        const number = data.plate_number || data.nopol || '';
        const series = data.plate_series || data.seri || '';
        
        if (hasValue(region) || hasValue(number) || hasValue(series)) {
            normalized.plate_number = [region, number, series].filter(hasValue).join(' ').trim() || '-';
        } else {
            normalized.plate_number = data.plat_nomor || data.no_polisi || '-';
        }

        // Map field variations based on actual API response
        normalized.merk = hasValue(data.brand) ? data.brand : (hasValue(data.merk) ? data.merk : '-');
        normalized.type_model = hasValue(data.vehicle_type) ? data.vehicle_type : (hasValue(data.Type) ? data.Type : (hasValue(data.type) ? data.type : '-'));
        normalized.model = hasValue(data.model) ? data.model : (hasValue(data.Model) ? data.Model : '-');
        normalized.tahun_pembuatan = hasValue(data.manufacture_year) ? data.manufacture_year : (hasValue(data.tahun) ? data.tahun : '-');
        normalized.warna = hasValue(data.color) ? data.color : (hasValue(data.warna) ? data.warna : '-');
        normalized.isi_silinder = hasValue(data.engine_capacity_cc) ? data.engine_capacity_cc : (hasValue(data.cc) ? data.cc : '-');
        normalized.jumlah_roda = hasValue(data.wheel_count) ? data.wheel_count : (hasValue(data.jml_roda) ? data.jml_roda : '-');

        normalized.no_rangka = hasValue(data.chassis_number) ? data.chassis_number : (hasValue(data.no_rangka) ? data.no_rangka : '-');
        normalized.no_mesin = hasValue(data.engine_number) ? data.engine_number : (hasValue(data.no_mesin) ? data.no_mesin : '-');
        normalized.no_bpkb = hasValue(data.bpkb_number) ? data.bpkb_number : (hasValue(data.no_bpkb) ? data.no_bpkb : '-');
        normalized.no_stnk = hasValue(data.stnk_number) ? data.stnk_number : (hasValue(data.no_stnk) ? data.no_stnk : '-');
        normalized.no_faktur = hasValue(data.invoice_number) && data.invoice_number !== '0' ? data.invoice_number : '-';
        normalized.tanggal_daftar = hasValue(data.registration_date) ? data.registration_date : (hasValue(data.tgl_daftar) ? data.tgl_daftar : '-');

        // Owner info - keep "-" as valid value for owner_name since it means "no name"
        normalized.nama_pemilik = data.owner_name !== undefined && data.owner_name !== null ? data.owner_name : (hasValue(data.nama) ? data.nama : '-');
        normalized.no_ktp = hasValue(data.nik) ? data.nik : (hasValue(data.no_ktp) ? data.no_ktp : '-');
        normalized.no_kk = hasValue(data.kk_number) ? data.kk_number : '-';
        normalized.no_hp = hasValue(data.phone_number) ? data.phone_number : '-';
        normalized.pekerjaan = hasValue(data.owner_job) ? data.owner_job : '-';
        normalized.alamat = hasValue(data.owner_address) ? data.owner_address : '-';
        normalized.provinsi = hasValue(data.province_code) ? data.province_code : '-';
        normalized.polda = hasValue(data.polda) ? data.polda : '-';

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
