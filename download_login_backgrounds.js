import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fileIds = [
    '1CIyUIJ7lAqv_lKRYE2IyVs4pig456H3a',
    '15IRlpMkOzrveoDr4s4fth8clQ8PVbnMW',
    '1nuxVJkNJuuifxEtZ42PE20MR1evmYhKR',
    '1sPfr8SVTO2TMThfLKDG9pRwX_xS-07a7',
    '1C6R-4_5IuVhDFNFaeMrXCVOmzsh0MuSL',
    '16lqmvOBBBiqrBQS35F7Ffe1LPBT5dxrS',
    '1CYRy42vQnNdcPSMFQRG3cahQYh-R14iD'
];

const downloadDir = path.join(__dirname, 'public', 'backgrounds', 'login');

if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

const downloadFile = ({ id, name }) => {
    return new Promise((resolve, reject) => {
        const fileName = name;
        const filePath = path.join(downloadDir, fileName);
        const file = fs.createWriteStream(filePath);
        const url = `https://drive.google.com/uc?export=download&id=${id}`;

        https.get(url, (response) => {
            // Check for redirect
            if (response.statusCode === 302 || response.statusCode === 303) {
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        console.log(`Downloaded ${fileName}`);
                        resolve();
                    });
                }).on('error', (err) => {
                    fs.unlink(filePath, () => { });
                    reject(err);
                });
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`Downloaded ${fileName}`);
                    resolve();
                });
            }
        }).on('error', (err) => {
            fs.unlink(filePath, () => { });
            reject(err);
        });
    });
};

async function downloadAll() {
    console.log('Starting downloads for Login...');
    for (let i = 0; i < fileIds.length; i++) {
        try {
            await downloadFile(fileIds[i], i);
        } catch (e) {
            console.error(`Failed to download image ${i + 1}:`, e.message);
        }
    }
    console.log('All done.');
}

downloadAll();
