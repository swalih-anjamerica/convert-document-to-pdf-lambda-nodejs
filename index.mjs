import AWS from 'aws-sdk';
import path from 'path';
import fs from 'fs';
import LambdaFS from 'lambdafs';
import { execSync } from 'child_process';

const region = "ap-south-1";
const s3 = new AWS.S3({ apiVersion: '2006-03-01', region });

export const handler = async (event) => {
    try {
        const bucket = event.Records[0].s3.bucket.name;
        const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

        // unpacking libreoffice
        await libreOfficeUnpack();

        // getting buffer from s3
        const s3Buffer = await getS3Object(bucket, key);

        // uploading to temp
        uploadingFileToFolder(s3Buffer, key, "/tmp");

        // converting to pdf
        await convertFileToPdf(key, "/tmp");

        // retrive file from /tmp
        let pdfFileName = key.substring(0, key.lastIndexOf(".")) + ".pdf";
        const pdfFileBuffer = retriveFileFromFolder(pdfFileName, "/tmp");

        // uploading to s3 bucket
        console.log("[*] Uploading file to s3 bucket");
        await uploadFileToS3(bucket, pdfFileBuffer, pdfFileName);

        return {
            success: true,
            message: "Uploaded successfully"
        }
    } catch (e) {
        return {
            error: e,
            success: false
        }
    }
}

const getS3Object = function (bucketName, keyFile) {
    return new Promise(function (success, reject) {
        s3.getObject(
            { Bucket: bucketName, Key: keyFile },
            function (error, data) {
                if (error) {
                    reject(error);
                } else {
                    success(data.Body);
                }
            }
        );
    });
}

const uploadFileToS3 = (bucketName, buffer, fileName) => {
    return new Promise((resolve, reject) => {
        s3.putObject({
            Body: buffer,
            Key: fileName,
            Bucket: bucketName,
        }, (error) => {
            if (error) {
                reject(error);
            } else {

                resolve(fileName);
            }
        });
    });
}

const uploadingFileToFolder = (buffer, fileName, dest) => {
    try {
        console.log(`[*] Writing file ${fileName} to ${dest}`)
        fs.writeFileSync(path.join(dest, fileName), buffer);
        console.log(`[+] File writing completed`)
    } catch (e) {
        console.log("[!] Error while writing file ", e);
        throw new Error(e);
    }
}

const retriveFileFromFolder = (fileName, dest) => {
    try {
        console.log(`[*] Retriving file ${fileName} from ${dest}`)
        const fileBuffer = fs.readFileSync(path.join(dest, fileName));
        return fileBuffer;
    } catch (e) {
        console.log("[!] Error while retriving file ", e);
        throw new Error(e);
    }
}

const libreOfficeUnpack = async () => {
    try {
        const libreOfficePath = path.join('/opt', 'lo.tar.br');
        const libreOfficeUnpackPath = path.join('/tmp/lo/instdir/program', 'soffice.bin')

        if (fs.existsSync(libreOfficeUnpackPath)) return console.log("[*] Already unpacked");
        console.log("[!] No libreoffice found. Unpacking");
        const unpackRes = await LambdaFS.inflate(libreOfficePath);
        console.log("[+] Unpacked successfully -- ", unpackRes);
    } catch (e) {
        console.log("[!] Error while upacking libreoffice ", e);
        throw new Error(e);
    }
}

const convertFileToPdf = async (fileName, dest) => {
    try {
        console.log(`[*] Showing current ${dest}`)
        console.log(execSync(`ls -ls ${dest}`).toString("utf-8"));

        const command = `export HOME=/tmp && /tmp/lo/instdir/program/soffice.bin --headless --norestore --invisible --nodefault --nofirststartwizard --nolockcheck --nologo --convert-to "pdf:writer_pdf_Export" --outdir /tmp ${path.join(dest, fileName)}`

        console.log("[*] Running pdf file conversion");
        try {
            console.log(execSync(command).toString("utf-8"));
        } catch (e) {
            console.log("Error on command ", command);
            console.log(execSync(command).toString("utf-8"));
            console.log(e);
        }
        console.log("[+] PDF conversion completed");

        console.log(`[*] Showing /tmp after pdf conversion`)
        console.log(execSync(`ls -ls /tmp`).toString("utf-8"));
    } catch (e) {
        console.log(`[!] Error while converting to pdf - FileName: ${fileName}`, e);
        throw new Error(e);
    }
}