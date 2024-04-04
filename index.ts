import { PdfSigner, SignDigitalParameters, SignerSettings } from 'sign-pdf-lib';
import * as fsPromises from "fs/promises";
import { PDFDocument } from 'pdf-lib';

async function main() {
    try {
        const filePath = 'Contrato de trabajo Prueba.pdf';
        const filePathVerify = 'out.pdf';

        // Leer el PDF para obtener el número total de páginas
        const pdfBytes = await fsPromises.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const totalPages = pdfDoc.getPageCount();

        // Crear una instancia de PdfSigner con la configuración necesaria
        const settings: SignerSettings = {
            signatureLength: 4000 - 6,
            rangePlaceHolder: 9999999,
            signatureComputer: {
                certificate: await fsPromises.readFile('firma.p12'),
                password: '',
            }
        };
        const pdfSigner = new PdfSigner(settings);

        // Definir los parámetros de la firma
        const info: SignDigitalParameters = {
            pageNumber: totalPages, // Firma en la última página
            signature: {
                name: 'Yosember',
                reason: 'Prueba Firma',
                contactInfo: "yosember.rodriguez@sosya.cl",
            },
            visual: {
                background: await fsPromises.readFile('mylogo.jpg'),
                rectangle: { left: 50, top: 800, right: 300, bottom: 650 }
                // Coordenadas más pequeñas para el rectángulo de la firma
            }
        };

        // Firmar el PDF
        const signedPdf = await pdfSigner.signAsync(pdfBytes, info);

        // Escribir el PDF firmado en un archivo
        await fsPromises.writeFile(filePathVerify, signedPdf);

        console.log("El PDF ha sido firmado correctamente en la última página.");
    } catch (error) {
        console.error('Error:', error);
    }
}



main();
