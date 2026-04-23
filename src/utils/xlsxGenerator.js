/**
 * XLSX Generator for EDABU Massal reports
 * Uses xlsx-js-style for proper styling (colors, merges, etc.)
 */
const XLSX = require('xlsx-js-style');
const fs = require('fs');
const path = require('path');

// Style constants matching bpjsmassal_20260420_011228.xlsx
const STYLES = {
    title: {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
        fill: { fgColor: { rgb: '2F5597' } },
        alignment: { horizontal: 'center', vertical: 'center' }
    },
    subtitle: {
        font: { sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' }
    },
    nikDicari: {
        font: { bold: true, sz: 11 },
        fill: { fgColor: { rgb: 'FCE4D6' } },
        alignment: { horizontal: 'left', vertical: 'center' }
    },
    header: {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        fill: { fgColor: { rgb: '4F81BD' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
        }
    },
    matchRow: {
        fill: { fgColor: { rgb: 'F7F9FC' } },
        border: {
            top: { style: 'thin', color: { rgb: 'D9D9D9' } },
            bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
            left: { style: 'thin', color: { rgb: 'D9D9D9' } },
            right: { style: 'thin', color: { rgb: 'D9D9D9' } }
        }
    },
    normalRow: {
        border: {
            top: { style: 'thin', color: { rgb: 'D9D9D9' } },
            bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
            left: { style: 'thin', color: { rgb: 'D9D9D9' } },
            right: { style: 'thin', color: { rgb: 'D9D9D9' } }
        }
    }
};

// Removed: No KK, Kelurahan, Kecamatan, Kabupaten, Provinsi, Kode Pos, Segmen
const HEADERS = ['Match NIK','NIK Peserta','No Kartu','Nama','Hub Keluarga','Jenis Kelamin','TTL','No HP','Email','Alamat','Status Peserta','Tanggungan','Perusahaan','Kode PKS','TMT Pegawai','Keterangan'];
const COL_COUNT = HEADERS.length; // 16 columns

/**
 * Generate styled EDABU Massal XLSX report
 */
function generateEdabuMassalXlsx(result, nikList, actualCost, outputDir = 'tmp') {
    const wb = XLSX.utils.book_new();
    const now = new Date();
    const timestamp = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}, ${String(now.getHours()).padStart(2,'0')}.${String(now.getMinutes()).padStart(2,'0')}.${String(now.getSeconds()).padStart(2,'0')}`;

    const rows = [];
    const merges = [];
    let rowIdx = 0;

    // Row 0: Title (merged)
    const titleRow = new Array(COL_COUNT).fill(null).map(() => ({ v: '', s: STYLES.title }));
    titleRow[0] = { v: 'Laporan BPJS Kesehatan Massal', t: 's', s: STYLES.title };
    rows.push(titleRow);
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: COL_COUNT - 1 } });
    rowIdx++;

    // Row 1: Subtitle (merged)
    const subtitleText = `Jenis: BPJS Kesehatan Massal   |   Waktu: ${timestamp}   |   Total NIK: ${nikList.length}   |   Cost Dipotong: ${actualCost}   |   Sukses: ${result.successCount}   |   Gagal: ${result.failedCount}`;
    const subtitleRow = new Array(COL_COUNT).fill(null).map(() => ({ v: '', s: STYLES.subtitle }));
    subtitleRow[0] = { v: subtitleText, t: 's', s: STYLES.subtitle };
    rows.push(subtitleRow);
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: COL_COUNT - 1 } });
    rowIdx++;

    // Row 2: Empty
    rows.push(new Array(COL_COUNT).fill({ v: '' }));
    rowIdx++;

    // Process each NIK result
    for (const item of result.results) {
        // NIK Dicari row (merged)
        const nikRow = new Array(COL_COUNT).fill(null).map(() => ({ v: '', s: STYLES.nikDicari }));
        nikRow[0] = { v: `NIK Dicari: ${item.nik}`, t: 's', s: STYLES.nikDicari };
        rows.push(nikRow);
        merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: COL_COUNT - 1 } });
        rowIdx++;

        // Header row
        const headerRow = HEADERS.map(h => ({ v: h, t: 's', s: STYLES.header }));
        rows.push(headerRow);
        rowIdx++;

        // Data rows
        if (item.success && item.data) {
            const anggota = item.data.anggota || [];
            const raw = item.data.raw || [];

            if (anggota.length > 0) {
                anggota.forEach(p => {
                    const isMatch = p.nik === item.nik;
                    const rawData = raw.find(r => r.NIK === p.nik);
                    const style = isMatch ? STYLES.matchRow : STYLES.normalRow;

                    // Get alamat from nikAddresses if available
                    const addr = item.nikAddresses?.[p.nik];
                    const alamatStr = addr?.alamat_lengkap || addr?.alamat || '-';

                    const dataRow = [
                        isMatch ? 'YA' : '-',
                        p.nik || '-',
                        p.noKartu || '-',
                        p.nama || '-',
                        p.hubunganKeluarga || rawData?.KDHUBKEL || '-',
                        p.jenisKelamin || '-',
                        p.ttl || '-',
                        p.noHP || '-',
                        p.email || '-',
                        alamatStr,
                        p.status || p.statusPeserta || '-',
                        rawData?.KDHUBKEL ? 'Ya (Tanggungan)' : '-',
                        rawData?.NMPPK || '-',
                        rawData?.KDPPK || '-',
                        rawData?.TGLMULAIKERJA || '-',
                        'Data found'
                    ].map(v => ({ v: String(v), t: 's', s: style }));

                    rows.push(dataRow);
                    rowIdx++;
                });
            } else {
                const dataRow = ['-',item.nik,'-','-','-','-','-','-','-','-','-','-','-','-','-','Data found but no members']
                    .map(v => ({ v: String(v), t: 's', s: STYLES.normalRow }));
                rows.push(dataRow);
                rowIdx++;
            }
        } else {
            const dataRow = ['-',item.nik,'-','-','-','-','-','-','-','-','-','-','-','-','-',item.error || 'Not found']
                .map(v => ({ v: String(v), t: 's', s: STYLES.normalRow }));
            rows.push(dataRow);
            rowIdx++;
        }

        // Empty row separator
        rows.push(new Array(COL_COUNT).fill({ v: '' }));
        rowIdx++;
    }

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;
    ws['!cols'] = new Array(COL_COUNT).fill({ wch: 44 });

    XLSX.utils.book_append_sheet(wb, ws, 'Laporan');

    // Generate filename
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const fileName = `bpjsmassal_${dateStr}.xlsx`;
    const filePath = path.join(outputDir, fileName);

    if (!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    XLSX.writeFile(wb, filePath);
    return { filePath, fileName };
}

module.exports = { generateEdabuMassalXlsx };
