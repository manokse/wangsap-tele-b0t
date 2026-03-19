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

        try {
            const url = `${this.getBaseUrl()}?api_key=${this.getApiKey()}&${paramName}=${encodeURIComponent(value)}`;
            
            console.log(`[ASEX Vehicle] ${type.toUpperCase()}: ${value}`);
            
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
                return {
                    success: true,
                    data: data.data,
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
