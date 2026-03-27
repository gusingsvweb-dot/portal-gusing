import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fileIds = [
    '1t9qDprQC63kPmy6lboz-aoTdFeRCAPfL',
    '11Njx6W4gJWHm4sJEbOoiGP6w-BkDKkHb',
    '1tfBTLLa7Fc_vFsgAbmr1dHCMyWqXfar-',
    '1C7YS7HzxNjn8RPI8vDsmYktnNL3F4B_K',
    '1Sfi6IIe9GZXfyv1BhH-ghRR2MYN089WK',
    '1Z3nahYp-hnu9MsKz-v1euRrQ8Bqr_I2e',
    '1hWq7paAp6GYmItnBnEgDc8TferFN4fqa',
    '1TMcq2JXS7MiNAj3GU7gZV_F-STW2Dlqn'
];

const downloadDir = path.join(__dirname, 'public', 'backgrounds');

if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

const downloadFile = (id, index) => {
    return new Promise((resolve, reject) => {
        const fileName = `bg-${index + 1}.jpg`;
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
    console.log('Starting downloads...');
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
