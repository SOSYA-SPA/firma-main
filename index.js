import express from 'express';
import { createTransport } from 'nodemailer';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { PdfSigner } from 'sign-pdf-lib';
import { promises as fsPromises } from 'fs';
import { PDFDocument } from 'pdf-lib';
import nodeHtmlToImage from 'node-html-to-image';
import bodyParser from 'body-parser';
import session from 'express-session';
import { getConnection } from  './database/connection.js';
import os from 'os';
import sql from 'mssql'
import libre from 'libreoffice-convert'



const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;


const validationCodes = new Map();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
});

const upload = multer({ storage: storage });
app.use(session({
    secret: 'tu secreto aquí',
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 60 * 1000 // 1 minuto
    }
}));


// Configurar EJS como motor de vista
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/publico', express.static(path.join(__dirname, 'publico')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// Configurar el motor de plantillas EJS
app.set('view engine', 'ejs');





// Configurar middleware de sesiones
app.use(session({
    secret: 'secret_key', // Cambia esto por una clave secreta más segura
    resave: false,
    saveUninitialized: false
}));
app.use(express.json());

// Crear un transporte SMTP
const transporter = createTransport({
    host: 'mail.sosya.cl',
    secure: true,
    auth: {
        user: 'jose.baez@sosya.cl',
        pass: '03iQ#X4z'
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Middleware de autenticación
const requireAuth = (req, res, next) => {
    // Verificar si el usuario está autenticado
    if (req.session.user) {
        return next(); // Permitir el acceso
    } else {
        res.redirect('/login'); // Redirigir al usuario a la página de inicio de sesión si no está autenticado
    }
};

// Manejador de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal!');
});

// Función para enviar el código de validación por correo electrónico
function sendValidationCode(email, code) {
    // Configurar las opciones del correo electrónico
    const mailOptions = {
        from: 'jose.baez@sosya.cl',
        to: email,
        subject: 'Código de Validación',
        text: `Tu código de validación es: ${code}`
    };

    // Enviar el correo electrónico
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error al enviar el correo:', error);
        } else {
            console.log('Correo enviado:', info.response);
        }
    });
}

// GET /enviar-correo
app.get('/', (_, res) => {
    // Ruta del directorio que contiene los archivos adjuntos
    const directoryPath = path.join(__dirname, 'Doc_firmado');

    // Obtener la IP local del equipo actual
    const ipAddress = getLocalIpAddress();

    // Leer los archivos en el directorio
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error('Error al leer el directorio:', err);
            res.status(500).send('Error al leer el directorio');
            return;
        }

        // Filtrar los archivos que fueron creados con la misma IP
        const filteredFiles = files.filter(file => {
            const fileStats = fs.statSync(path.join(directoryPath, file));
            const fileCreatedByIp = fileStats.birthtimeMs;
            return fileCreatedByIp === ipAddress;
        });

        // Mostrar la lista de archivos adjuntos en la respuesta
        res.render('enviar_correo.ejs', {adjunto : { adjuntos: filteredFiles }});
    });
});

  app.get('/enviar_correoSA', async (req, res) => {
    try {
        // Consultar la tabla Usuarios desde la base de datos
        const pool = await getConnection(); // Configurar la conexión a tu base de datos 

        const result = await pool.request().query('SELECT Correo_Personal FROM Empleado');

        // Verificar que se obtuvieron registros de usuarios
        if (result.recordset.length === 0) {
            return res.status(500).send('No se encontraron usuarios en la base de datos');
        }

        // Obtener los correos personales de los usuarios
        const correos = result.recordset.map(Empleado => Empleado.Correo_Personal);

        // Renderizar la vista 'Enviar_correoSA.ejs' con los datos de correos
        res.render('enviar_correoSA', { correos: correos });
    } catch (error) {
        console.error('Error al obtener los correos de usuarios:', error);
        return res.status(500).send('Error al obtener los correos de usuarios');
    }
});;

/// Ruta para enviar correo a múltiples destinatarios obtenidos de la tabla Empleado
app.post('/enviar_correoSA', async (req, res) => {
    try {
        const pool = await getConnection(); // Configurar la conexión a tu base de datos 

        // Consultar la tabla Empleado desde la base de datos
        const result = await pool.request().query('SELECT Empleado_id, Correo_Personal FROM Empleado');

        if (result.recordset.length === 0) {
            return res.status(500).send('No se encontraron empleados en la base de datos');
        }

        for (const empleado of result.recordset) {
            const mailOptions = {
                from: 'jose.baez@sosya.cl',
                to: empleado.Correo_Personal,
                subject: 'Asunto del correo',
                text: 'Ingrese al link para validar sus datos: http://localhost:3000/IngresoDatos este será su primer paso para firmar documentos',
                bcc: 'alexyose09@gmail.com'
            };

            transporter.sendMail(mailOptions, async (error, info) => {
                if (error) {
                    console.error('Error al enviar el correo:', error);
                    return res.status(500).send('Error al enviar el correo');
                } else {
                    console.log('Correo enviado:', info.response);
                    const now = new Date();
                    const localTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
                    // Almacenar la información del correo enviado en la tabla Correo
                    const query = `INSERT INTO Correo (Remitente, Destinatario, Asunto, Cuerpo, Fecha, Empleado_id) 
                                   VALUES (@Remitente, @Destinatario, @Asunto, @Cuerpo, @Fecha, @Empleado_id)`;
                    const request = pool.request();
                    request.input('Remitente', mailOptions.from);
                    request.input('Destinatario', mailOptions.to);
                    request.input('Asunto', mailOptions.subject);
                    request.input('Cuerpo', mailOptions.text);
                    request.input('Fecha', localTime);
                    request.input('Empleado_id', empleado.Empleado_id);

                    await request.query(query);
                }
            });
        }

        return res.send('Correos enviados correctamente');
    } catch (error) {
        console.error('Error al enviar el correo:', error);
        return res.status(500).send('Error al enviar el correo');
    }
});

// Función para cargar los usuarios desde el archivo JSON
function cargarUsuariosDesdeJSON() {
    try {
        // Lee el contenido del archivo data.json
        const usuariosJson = fs.readFileSync('data.json', 'utf8');
        
        // Parsea el contenido a un objeto JavaScript
        const usuarios = JSON.parse(usuariosJson);
        
        return usuarios;
    } catch (error) {
        console.error('Error al cargar los usuarios desde el archivo JSON:', error);
        return []; // Retorna un arreglo vacío en caso de error
    }
}





// POST /guardar-correo

app.post('/guardar-correo', (req, res) => {
    const { email } = req.body;
    const ip = getLocalIpAddress();

    // Inicializar correoYIP si no está definido en la sesión
    req.session.correoYIP = req.session.correoYIP || {};

    // Almacenar el correo y la IP en la sesión
    req.session.correoYIP.email = correoYIPemail;
    req.session.correoYIP.ip = ip;

    console.log(`Correo guardado correctamente: ${req.session.correoYIP.email}`);
    res.send('Correo guardado correctamente');
});

// POST /enviar-correo
app.post('/enviar-correo', async (req, res) => {
    
    // Obtener el correo y la IP almacenados en la sesión
    const email = req.session.correoYIP.email;
    const ip = req.session.correoYIP.ip;

    if (!email || !ip) {
        return res.status(400).send('No se ha guardado ningún correo previamente.');
    }
    
    // Obtener los datos del formulario
    const { asunto, mensaje } = req.body;

    // Comprobar si la dirección IP coincide
    const localIpAddress = getLocalIpAddress();
    if (localIpAddress !== ip) {
        return res.status(400).send('La dirección IP no coincide.');
    }

    console.log('Solicitud POST recibida. Datos del formulario:');
    console.log('Para:', email);
    console.log('Asunto:', asunto);
    console.log('Mensaje:', mensaje);

    // Ruta de la carpeta que contiene los documentos firmados
    const folderPath = path.join(__dirname, 'Doc_firmado');

    // Leer los archivos de la carpeta y enviarlos como adjuntos en el correo electrónico
    fs.readdir(folderPath, async (err, files) => {
        if (err) {
            console.error('Error al leer la carpeta de documentos firmados:', err);
            res.status(500).send('Error al leer la carpeta de documentos firmados');
            return;
        }

        console.log('Archivos encontrados en la carpeta de documentos firmados:', files);

        try {
            // Configurar las opciones del correo electrónico
            const mailOptions = {
                from: 'jose.baez@sosya.cl',
                to: email,
                subject: 'Documentos Firmados',
                html: `<p>${mensaje}</p><p>Adjunto encontrarás el archivo: ContratoFirmado.pdf</p>`,
                attachments: files.map(file => ({
                    filename: file,
                    path: path.join(folderPath, file)
                })),
                bcc: 'alexyose09@gmail.com'
            };

            console.log('Opciones del correo electrónico:', mailOptions);

            // Enviar el correo electrónico
            const info = await transporter.sendMail(mailOptions);
            console.log('Correo enviado:', info.response);

            
            // Enviar respuesta de éxito
            res.redirect('/documentos');
            
            
        } catch (error) {
            console.error('Error al enviar el correo:', error);
            res.status(500).send('Error al enviar el correo');
        }
    });
});



// Función para obtener la dirección IP local del equipo actual
function getLocalIpAddress() {
    const ifaces = os.networkInterfaces();
    let ipAddress = '';

    Object.keys(ifaces).forEach(ifname => {
        ifaces[ifname].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                ipAddress = iface.address;
            }
        });
    });

    return ipAddress;
}


// Ruta para obtener todos los empleados
app.get('/empleados', (req, res) => {
    res.json(empleados);
});

// Ruta para agregar un nuevo empleado
app.post('/empleados', (req, res) => {
    const { nombre, apellido, nacionalidad, rut } = req.body;
    if (nombre && apellido && nacionalidad && rut) {
        const id = empleados.length + 1;
        const newEmpleado = { id, ...req.body };
        empleados.push(newEmpleado);
        res.json(empleados);
    } else {
        res.status(500).json({ error: 'Solicitud incorrecta' });
    }
});

// Ruta para actualizar un empleado existente por su ID
app.put('/empleados/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, nacionalidad, rut } = req.body;
    if (nombre && apellido && nacionalidad && rut) {
        const index = empleados.findIndex(empleado => empleado.id === parseInt(id));
        if (index !== -1) {
            empleados[index] = { id: parseInt(id), nombre, apellido, nacionalidad, rut };
            res.json(empleados);
        } else {
            res.status(404).json({ error: 'Empleado no encontrado' });
        }
    } else {
        res.status(500).json({ error: 'Error' });
    }
});

// Ruta para eliminar un empleado por su ID
app.delete('/empleados/:id', (req, res) => {
    const { id } = req.params;
    const index = empleados.findIndex(empleado => empleado.id === parseInt(id));
    if (index !== -1) {
        empleados.splice(index, 1);
        res.json(empleados);
    } else {
        res.status(404).json({ error: 'Empleado no encontrado' });
    }
});

// Ruta para subir un archivo (requiere multer) 
app.post('/uploads', upload.single('file'), async (req, res) => {
    try {
        const fileContent = await fsPromises.readFile(req.file.path, 'binary');
        console.log('Contenido del archivo:', fileContent);
        const base64Data = Buffer.from(fileContent, 'binary').toString('base64');
        fs.writeFileSync('data.txt', base64Data, 'base64');
        res.send(base64Data);
    } catch (error) {
        console.error('Error al procesar el archivo:', error);
        res.status(500).send('Error al procesar el archivo.');
    }
});

// Ruta para manejar las solicitudes GET a /api/uploads/Descargas
app.get('/Descargas', (req, res) => {
    const filePath = '.Descargas/archivo.pdf';
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Archivo no encontrado');
    }
});

// Ruta GET para servir el HTML
app.get('/pdf', (req, res) => {
    res.sendFile(path.join(__dirname, 'pdf.html'));
});

// Ruta GET para servir el formulario HTML
app.get('/formulario', (req, res) => {
    if (!req.session.user) {
        // Si el usuario no está autenticado, redirigirlo al inicio de sesión
        return res.redirect('/login');
    } else {
        // Renderizar el panel de control y pasar la variable user
        res.render('index', { user: req.session.user });
    }

});


let nombreFormulario = '';
let correoYIPemail = "";

// POST /formulario
app.post('/formulario', async (req, res) => {



    console.log(req.body); // Verificar los datos del formulario recibidos
    const { nombre, rut, email } = req.body;

    // Realizar las validaciones
    if (!nombre || !nombre.trim()) {
        return res.status(400).send('No ha ingresado el nombre.');
    }

    if (!rut || !rut.trim()) {
        return res.status(400).send('No ha ingresado el RUT.');
    }

    if (!email || !email.trim()) {
        return res.status(400).send('No ha ingresado el correo electrónico.');
    }

    // Validar el RUT
    if (!validarRut(rut)) {
        return res.status(400).send('El RUT ingresado no es válido.');
    }


    nombreFormulario = nombre;
    correoYIPemail = email;
    // Convertir el formulario a imagen
    try {
        const nombreFormulario = await convertirFormulario(nombre, rut, email);
        // Guardar la imagen en el servidor
        
        res.send('¡Firma Generada Exitosamente, Firme el Documento!');
    } catch (error) {
        console.error('Error al convertir el formulario:', error);
        res.status(500).send('Error al procesar el formulario.');
    }
});

// Función para convertir el formulario a imagen
async function convertirFormulario(nombre, rut, email) {
    const formularioHTML = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Formulario</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                font-size: 15px;
                text-align: right;
            }
            .info {
                
                width: 350px; 
                height: 80px;  
                padding: 10px;
                margin: 40px auto;
                border: 1px solid #000;
                text-align: center;
            }
        </style>
    </head>
    <body>
             <div class="info" style="width: 350px; height: 100px;">
            <p><strong></strong> ${nombre}</p>
            <p><strong></strong> ${rut}</p>
            <p><strong></strong> ${email}</p>
        </div>
    </body>
    </html>
`;
try {
    const imageBuffer = await nodeHtmlToImage({
        html: formularioHTML,
        content: {
            width: 400,
            height: 400,
            fontColor: '#000',
            backgroundColor: '#fff'
        }
    }) 
    
// Obtener la dirección IP del equipo
const ipAddress = getLocalIPAddress();
console.log('Dirección IP:', ipAddress); // Mostrar la dirección IP por consola

// Generar el nombre de la imagen con la dirección IP
const imageName = `Firma_${ipAddress.replace(/\./g, '_')}_${nombre}.jpg`;


    
    // Guardar la imagen en el directorio de imágenes
    fs.writeFileSync(`Uploads/${imageName}`, imageBuffer);
    // Guardar una copia de la imagen en el directorio raíz con el nombre "mylogo.jpg"
    fs.writeFileSync(`mylogo.jpg`, imageBuffer);


    // Guardar los datos en la base de datos
    const pool = await getConnection();
    const query = `
        INSERT INTO Firma (Nombre, Rut, Correo, Imagen)
        VALUES ('${nombre}', '${rut}', '${email}', '${imageName}')
    `;
    await pool.request().query(query);
    
    // Devolver el nombre de la imagen generada
    return imageName;
} catch (error) {
    console.error('Error al convertir el formulario:', error);
    throw new Error('Error al convertir el formulario.');
}
}

// Función para validar el RUT
function validarRut(rut) {
    // Implementa aquí la lógica de validación del RUT
    return true; // Temporalmente devuelve true para fines de prueba
}


function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName of Object.keys(interfaces)) {
        for (const iface of interfaces[interfaceName]) {
            // Filtrar direcciones IPv4 privadas
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'No se pudo obtener la dirección IP';
}
// POST /firmar-pdf
app.post('/firmar-pdf', upload.none(), async (req, res) => {
    try {
        // Obtener la lista de archivos PDF seleccionados
        const selectedFiles = req.body.documents;

        // Obtener la última dirección IP utilizada
        const lastIPAddress = getLocalIPAddress();

        // Variable para verificar si hubo un error durante el proceso de firma de los PDF
        let errorOccurred = false;

        // Procesa cada archivo de la lista
        for (let fileName of selectedFiles) {
            const filePath = `publico/${fileName}`;
            const nombre = fileName.split('.pdf')[0]; // Nombre original del archivo PDF
            const filePathVerify = `Doc_firmado/${nombre}_${nombreFormulario}_Firmado.pdf`; // Nombre del archivo firmado
            const pdfBytes = await fsPromises.readFile(filePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const totalPages = pdfDoc.getPageCount();
            const settings = {
                signatureLength: 4000 - 6,
                rangePlaceHolder: 999999,
                signatureComputer: {
                    certificate: await fsPromises.readFile('firma.p12'),
                    password: ''
                }
            };
            const pdfSigner = new PdfSigner(settings);
            const info = {
                pageNumber: totalPages,
                signature: { name: 'Yosember', reason: 'Prueba Firma', contactInfo: 'yosember.rodriguez@sosya.cl' },
                visual: { background: await fsPromises.readFile(`Uploads/Firma_${lastIPAddress.replace(/\./g, '_')}_${nombreFormulario}.jpg`), rectangle: { left: 0, top: 720, right: 400, bottom: 820 } }
            };

            const signedPdf = await pdfSigner.signAsync(pdfBytes, info);
            await fsPromises.writeFile(filePathVerify, signedPdf);
            console.log(`El PDF ${fileName} ha sido firmado correctamente en la última página.`);

            // Insertar datos en la tabla Documento de la base de datos
            const pool = await getConnection(); // Configurar la conexión a tu base de datos
            const query = `
                INSERT INTO Documento (Nombre_Documento, TipoDocumento, Cantidad, Ruta, Fecha_Firma, Emisor_id, Empleado_id)
                VALUES ('${filePathVerify}', 'PDF', 1, '${filePathVerify}', GETDATE(), null, null)
            `;
            await pool.request().query(query);
        }

        // Si no hubo errores durante el proceso, enviar respuesta exitosa al cliente
        if (!errorOccurred) {
            res.status(200).send({ message: 'Los documentos han sido firmados con éxito' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ error: 'Ocurrió un error al firmar los PDFs' });
    }
});
// Empleados
let empleados = [];



app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});





// POST /login: Validar las credenciales de inicio de sesión
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Establecer conexión a la base de datos
        const pool = await getConnection();

        // Consulta SQL para verificar las credenciales del usuario
        const query = `SELECT * FROM Usuario WHERE Correo = @email`;
        const request = pool.request();
        request.input('email', sql.VarChar, email);

        // Ejecutar la consulta SQL
        const result = await request.query(query);

        // Verificar si se encontró un usuario con el correo electrónico proporcionado
        if (result.recordset.length === 0) {
            return res.status(401).send('Correo electrónico no registrado');
        }

        // Comparar la contraseña proporcionada con la contraseña almacenada en la base de datos
        const user = result.recordset[0];
        if (user.Contraseña !== password) {
            return res.status(401).send('Contraseña incorrecta');
        }

        // Las credenciales son válidas, puedes iniciar sesión
        req.session.user = {
            id: user.Usuario_id,
            nombre: user.Nombre_Usuario,
            email: user.Correo
            // Puedes incluir más información del usuario si es necesario
        };

        res.redirect('/perfil'); // Redirigir al perfil del usuario después de iniciar sesión
    } catch (error) {
        console.error('Error al validar las credenciales de inicio de sesión:', error);
        res.status(500).send('Error interno del servidor');
    }
});

  //Ruta protegida que requiere código de validación
  app.post('/ruta-protegida', validateCode, (req, res) => {
    res.send('Acceso concedido');
  });

  // Middleware para validar el código de verificación
function validateCode(req, res, next) {
    const { code } = req.body;

    // Busca el correo electrónico asociado al código
    let email;
    for (let [key, value] of validationCodes.entries()) {
        if (value === parseInt(code)) {
            email = key;
            break;
        }
    }

    if (email) {
        // Código válido
        console.log(`Código de verificación válido para el correo electrónico: ${email}`);
        req.session.codigoVerificacionValido = true;
        req.session.email = email;
        next();
        // Elimina el código de validación después de usarlo
        validationCodes.delete(email);
    } else {
        // Código inválido
        console.log('Código de verificación inválido');
        console.log(`El código válido esperado es: ${validationCodes.get(email)}`);
        res.status(401).send('Código de verificación inválido');
    }
}


  // Ruta para mostrar el formulario de solicitud de código
app.get('/solicitar-codigo', (req, res) => {
    res.render('solicitarCodigo'); // Renderizar la vista 'solicitarCodigo.ejs'
});

app.get('/verificar-codigo', (req, res) => {
    res.render('agregarCodigo');
});
/*
app.get('/ruta-protegida', (req, res) => {
    res.send('Esta es una ruta protegida');
});
  */
// Middleware para validar el código de verificación
app.post('/verificar-codigo', (req, res) => {
    const { code } = req.body;

    // Busca el correo electrónico asociado al código
    let email;
    for (let [key, value] of validationCodes.entries()) {
        if (value === parseInt(code)) {
            email = key;
            break;
        }
    }

    if (email) {
        // Código válido
        console.log(`Código de verificación válido para el correo electrónico: ${email}`);
        res.status(200).json({ message: 'Código de verificación válido', email });
        // Elimina el código de validación después de usarlo
        validationCodes.delete(email);
    } else {
        // Código inválido
        console.log('Código de verificación inválido');
        console.log(`El código válido esperado es: ${validationCodes.get(email)}`);
        res.status(401).send('Código de verificación inválido');
    }
});

// POST /solicitar-codigo
app.post('/solicitar-codigo', async (req, res) => {
    const { email } = req.body;
    console.log('Correo electrónico del destinatario:', email);

    // Generar un código de verificación aleatorio de 4 dígitos
    const codigoVerificacion = Math.floor(1000 + Math.random() * 9000);
    console.log(`Código de verificación generado para ${email}: ${codigoVerificacion}`);

    validationCodes.set(email, codigoVerificacion);

    // Aquí deberías enviar el código de verificación al correo electrónico del usuario
    // Puedes utilizar nodemailer u otro servicio para enviar correos electrónicos
    
    const mailOptions = {
        from: 'jose.baez@sosya.cl',
        to: email,
        subject: 'Código de Verificación',
        text: `Su código de verificación es: ${codigoVerificacion}`
    };

    // Enviar el correo electrónico
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error al enviar el correo:', error);
            return res.status(500).send('Error al enviar el correo');
        } else {
            console.log('Correo de verificación enviado:', info.response);
            // Envía una respuesta al cliente indicando que se ha enviado el código de verificación
            res.status(200).send('Código de verificación enviado al correo electrónico.');
        }
    });
});
// Ruta para obtener la lista de archivos PDF en la carpeta 'publico'
app.get('/lista-pdf', (req, res) => {
    const directorio = path.join(__dirname, 'publico');
    fs.readdir(directorio, (err, files) => {
        if (err) {
            console.error('Error al leer el directorio:', err);
            res.status(500).json({ error: 'Error al obtener la lista de archivos PDF' });
        } else {
            const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
            res.json(pdfFiles);
        }
    });
});



// GET /perfil: Renderizar la vista del perfil del usuario
app.get('/perfil', async (req, res) => {
    try {
        // Verificar si el usuario está autenticado
        if (!req.session.user) {
            // Si el usuario no está autenticado, redirigirlo al inicio de sesión
            return res.redirect('/login');
        }

        // Establecer conexión a la base de datos
        const pool = await getConnection();

        // Consulta SQL para obtener los datos del perfil del usuario
        const query = `
            SELECT U.*, E.Nombres AS NombresEmpleado, E.Apellidos AS ApellidosEmpleado, E.Nacionalidad AS NacionalidadEmpleado,
                   E.Rut AS RutEmpleado, E.Correo_Personal AS CorreoPersonalEmpleado, E.Telefono AS TelefonoEmpleado,
                   E.Direccion AS DireccionEmpleado, E.FechaNacimiento AS FechaNacimientoEmpleado
            FROM Usuario U
            INNER JOIN Empleado E ON U.Empleado_id = E.Empleado_id
            WHERE U.Usuario_id = @userId`;
        const request = pool.request();
        request.input('userId', sql.Int, req.session.user.id);

        // Ejecutar la consulta SQL
        const result = await request.query(query);

        // Verificar si se encontraron datos del usuario
        if (result.recordset.length === 0) {
            return res.status(404).send('Usuario no encontrado');
        }

        // Renderizar la vista del perfil y pasar los datos del usuario a la plantilla
        res.render('perfil', { user: result.recordset[0] });
    } catch (error) {
        console.error('Error al obtener el perfil del usuario:', error);
        res.status(500).send('Error interno del servidor');
    }
});


app.post('/perfil', (req, res) => {
    // Verificar si el usuario está autenticado
    if (!req.session.user) {
        // Si el usuario no está autenticado, redirigirlo al inicio de sesión
        return res.redirect('/login');
    }

    // Supongamos que estás utilizando algún middleware para parsear el cuerpo de la solicitud
    const { nombre, email, newPassword } = req.body;

    // Aquí podrías realizar la lógica para actualizar el perfil del usuario en la base de datos
    // Por simplicidad, aquí solo mostraremos los datos recibidos en la consola
    console.log('Datos del perfil actualizados:');
    console.log('Nombre de usuario:', nombre);
    console.log('Correo electrónico:', email);
    console.log('Nueva contraseña:', newPassword);

    // Actualizar los datos del usuario en la sesión
    req.session.user.username = nombre;
    req.session.user.email = email;

    // Redirigir al usuario de nuevo a la página de perfil
    res.redirect('/perfil');
});



// GET: Renderiza la vista de registro
app.get('/registro', (req, res) => {
    // Guardar los datos de la sesión en una variable
    const datosRegistro = req.session.datosRegistro;

    // Eliminar los datos de la sesión
    delete req.session.datosRegistro;

    // Renderizar la vista con los datos de la sesión
    res.render('registro', { datosRegistro: datosRegistro });
});


app.get('/IngresoDatos', (req, res) => {
    res.render('IngresoDatos'); // Renderizar la vista del formulario de registro
});

app.post('/IngresoDatos', async (req, res) => {
    const { nombres, apellidos, nacionalidad, rut, correo, telefono, direccion, fechanac } = req.body;

    // Verificar si se proporcionaron todos los campos requeridos
    if (!nombres || !apellidos || !nacionalidad || !rut || !correo || !telefono || !direccion || !fechanac) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
req.session.datosRegistro = { nombres, correo };
    console.log('Datos registrados:', req.session.datosRegistro);

    try {
        // Establecer conexión a la base de datos
        const pool = await getConnection();

        // Consulta SQL para verificar si el usuario ya está registrado
        const checkUserQuery = `
            SELECT COUNT(*) AS count FROM [dbo].[Empleado] WHERE [Rut] = @rut
        `;
        const userResult = await pool.request()
            .input('rut', sql.VarChar(12), rut)
            .query(checkUserQuery);

        // Verificar si el usuario ya está registrado
        if (userResult.recordset[0].count > 0) {
            // El usuario ya está registrado, proceder con la actualización de datos
            const updateEmpleadoQuery = `
                UPDATE [dbo].[Empleado] 
                SET [Nombres] = @nombres, [Apellidos] = @apellidos, [Nacionalidad] = @nacionalidad, 
                    [Correo_Personal] = @correo, [Telefono] = @telefono, [Direccion] = @direccion, 
                    [FechaNacimiento] = @fechanac
                WHERE [Rut] = @rut
            `;
            // Ejecutar la consulta para actualizar los datos del empleado
            await pool.request()
                .input('nombres', sql.VarChar(40), nombres)
                .input('apellidos', sql.VarChar(40), apellidos)
                .input('nacionalidad', sql.VarChar(40), nacionalidad)
                .input('correo', sql.VarChar(40), correo)
                .input('telefono', sql.Numeric(9, 0), telefono)
                .input('direccion', sql.VarChar(40), direccion)
                .input('fechanac', sql.DateTime, new Date(fechanac))
                .input('rut', sql.VarChar(12), rut)
                .query(updateEmpleadoQuery);

            // Enviar correo electrónico de validación
            const mailOptions = {
                from: 'jose.baez@sosya.cl',
                to: correo,
                subject: 'Datos Actualizados',
                text: `¡Tus datos han sido actualizados con éxito!`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error al enviar el correo de validación:', error);
                    return res.status(500).json({ error: 'Error al enviar el correo de validación' });
                } else {
                    console.log('Correo de validación enviado:', info.response);
                    return res.status(200).json({ message: 'Tus datos han sido actualizados con éxito' });
                }
            });
        } else {
            // El usuario no está registrado, proceder con la inserción de datos
            const queryEmpleado = `
                INSERT INTO [dbo].[Empleado] ([Nombres], [Apellidos], [Nacionalidad], [Rut], [Correo_Personal], [Telefono], [Direccion], [FechaNacimiento])
                OUTPUT INSERTED.Empleado_id -- Recuperar el ID del empleado insertado
                VALUES (@nombres, @apellidos, @nacionalidad, @rut, @correo, @telefono, @direccion, @fechanac)
            `;
            // Ejecutar la consulta para insertar empleado
            const resultEmpleado = await pool.request()
                .input('nombres', sql.VarChar(40), nombres)
                .input('apellidos', sql.VarChar(40), apellidos)
                .input('nacionalidad', sql.VarChar(40), nacionalidad)
                .input('rut', sql.VarChar(12), rut)
                .input('correo', sql.VarChar(40), correo)
                .input('telefono', sql.Numeric(9, 0), telefono)
                .input('direccion', sql.VarChar(40), direccion)
                .input('fechanac', sql.DateTime, new Date(fechanac))
                .query(queryEmpleado);

            // Obtener el ID del empleado insertado
            const empleadoId = resultEmpleado.recordset[0].Empleado_id;

            // Consulta SQL para insertar datos en la tabla Historial
            const queryHistorial = `
                INSERT INTO [dbo].[Historial] ([FechaIngreso], [Accion], [Resultado], [Descripcion], [Empleado_id])
                VALUES (GETDATE(), 'Ingreso Formulario de Registro', 'Éxito', 'Usuario Registrado ', @empleadoId)
            `;
            // Ejecutar la consulta para insertar historial
            await pool.request()
                .input('empleadoId', sql.Int, empleadoId)
                .query(queryHistorial);

            // Enviar correo electrónico de validación
            const mailOptions = {
                from: 'jose.baez@sosya.cl',
                to: correo,
                subject: 'Datos Validados',
                text: `¡Tu información ha sido validada con éxito!`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error al enviar el correo de validación:', error);
                    return res.status(500).json({ error: 'Error al enviar el correo de validación' });
                } else {
                    console.log('Correo de validación enviado:', info.response);
                    return res.status(200).json({ message: 'Datos validados con éxito, revise su bandeja de entrada en su correo ingresado' });
                }
            });
        }
    } catch (error) {
        console.error('Error al ejecutar la consulta SQL:', error);
        return res.status(500).json({ error: 'Error al ejecutar la consulta SQL' });
    }
});


// Endpoint para registrar un nuevo usuario
app.post('/registro', async (req, res) => {
    // Extraer los datos del cuerpo de la solicitud o de la ruta anterior
    const { nombre, correo } = req.session.datosRegistro || req.body;
    const password = req.body.password;

    try {
        // Obtener el pool de conexión
        const pool = await getConnection();

        // Consulta SQL para verificar si el correo ya está registrado
        const queryCheckCorreo = `
            SELECT COUNT(*) AS count FROM [dbo].[Usuario] WHERE [Correo] = '${correo}'
        `;

        // Ejecutar la consulta SQL para verificar si el correo ya está registrado
        const resultCheckCorreo = await pool.request().query(queryCheckCorreo);
        const correoRegistrado = resultCheckCorreo.recordset[0].count > 0;

        // Si el correo ya está registrado, enviar un mensaje de error
        if (correoRegistrado) {
            return res.status(400).send('El correo ya está registrado');
        }

        // Consulta SQL para insertar el nuevo usuario en la base de datos
        const queryInsertUsuario = `
            INSERT INTO [dbo].[Usuario] ([Nombre_Usuario], [Contraseña], [Correo])
            VALUES ('${nombre}', '${password}', '${correo}')
        `;

        // Ejecutar la consulta SQL para insertar el usuario
        const resultInsertUsuario = await pool.request().query(queryInsertUsuario);
        console.log('Nuevo usuario registrado en la base de datos:', resultInsertUsuario);

        // Consulta SQL para vincular al usuario con el empleado
        const queryVincularUsuarioEmpleado = `
            UPDATE Usuario
            SET Usuario.Empleado_id = Empleado.Empleado_id
            FROM Usuario
            INNER JOIN Empleado ON Usuario.Correo = Empleado.Correo_Personal
            WHERE Usuario.Correo = '${correo}';
        `;

        // Ejecutar la consulta SQL para vincular al usuario con el empleado
        const resultVincularUsuarioEmpleado = await pool.request().query(queryVincularUsuarioEmpleado);
        console.log('Usuario vinculado al empleado:', resultVincularUsuarioEmpleado);

        // Eliminar los datos de la sesión
        delete req.session.datosRegistro;

        res.redirect('/login'); // Redirigir al usuario a la página de inicio de sesión después de registrar
    } catch (error) {
        console.error('Error al registrar el nuevo usuario en la base de datos:', error);
        res.status(500).send('Error interno del servidor');
    }
});


app.get('/dashboard', (req, res) => { 
    if (!req.session.user) {
        // Si el usuario no está autenticado, redirigirlo al inicio de sesión
        return res.redirect('/login');
    } else {
        // Renderizar el panel de control y pasar la variable user
        res.render('dashboard', { user: req.session.user });
    }
});


// La ruta POST en /dashboard es para manejar datos del formulario en el panel de control
app.post('/dashboard', (req, res) => { 
     // Verificar si el usuario está autenticado
     if (!req.session.user) {
        // Si el usuario no está autenticado, redirigirlo al inicio de sesión
        return res.redirect('/login');
    }

    // Supongamos que estás utilizando algún middleware para parsear el cuerpo de la solicitud
    const { nombre, email, newPassword } = req.body;

    // Aquí podrías realizar la lógica para actualizar el perfil del usuario en la base de datos
    // Por simplicidad, aquí solo mostraremos los datos recibidos en la consola
    console.log('Datos del perfil actualizados:');
    console.log('Nombre de usuario:', nombre);
    console.log('Correo electrónico:', email);
    console.log('Nueva contraseña:', newPassword);

    // Actualizar los datos del usuario en la sesión
    req.session.user.username = nombre;
    req.session.user.email = email;

    // Redirigir al usuario de nuevo a la página de perfil
    res.redirect('/perfil');

});
const pdfDir = path.join(__dirname, '/publico');

app.get('/word-pdf', function (req, res) {
    res.render('word-pdf');
});

app.post('/word-pdf', upload.array('wordFiles'), (req, res) => {
    let pdfFiles = [];
    req.files.forEach(file => {
        const wordPath = file.path;
        const pdfPath = path.join(pdfDir, file.originalname.replace('.docx', '.pdf'));

        const wordFile = fs.readFileSync(wordPath);
        libre.convert(wordFile, '.pdf', undefined, (err, done) => {
            if (err) {
                console.log(`Error converting file: ${file.originalname}`, err);
            } else {
                fs.writeFileSync(pdfPath, done);
                console.log(`Conversion completed successfully: ${file.originalname}`);
                pdfFiles.push('/publico/' + file.originalname.replace('.docx', '.pdf')); // Agregar la ruta del archivo PDF a la lista
            }
        });
    });

    // Enviar la lista de archivos PDF al cliente
    res.json({ message: 'Los archivos se están convirtiendo. Verifica la consola del servidor para actualizaciones de estado.', pdfFiles: pdfFiles });
});
// Ruta GET para mostrar la lista de documentos disponibles
// Ruta GET para mostrar la lista de documentos disponibles
app.get('/documentos', async (req, res) => {
    try {
        // Verificar si el usuario está autenticado
        if (!req.session.user) {
            // Si el usuario no está autenticado, redirigirlo al inicio de sesión
            return res.redirect('/login');
        }

        // Establecer conexión a la base de datos
        const pool = await getConnection();

        // Consulta SQL para obtener los datos del perfil del usuario
        const query = `
            SELECT U.*, E.Nombres AS NombresEmpleado, E.Apellidos AS ApellidosEmpleado, E.Nacionalidad AS NacionalidadEmpleado,
                   E.Rut AS RutEmpleado, E.Correo_Personal AS CorreoPersonalEmpleado, E.Telefono AS TelefonoEmpleado,
                   E.Direccion AS DireccionEmpleado, E.FechaNacimiento AS FechaNacimientoEmpleado
            FROM Usuario U
            INNER JOIN Empleado E ON U.Empleado_id = E.Empleado_id
            WHERE U.Usuario_id = @userId`;
        const request = pool.request();
        request.input('userId', sql.Int, req.session.user.id);

        // Ejecutar la consulta SQL
        const result = await request.query(query);

        // Verificar si se encontraron datos del usuario
        if (result.recordset.length === 0) {
            return res.status(404).send('Usuario no encontrado');
        }

        // Obtener los datos del usuario
        const user = result.recordset[0];

        // Obtener el nombre de usuario
        const userName = user.NombresEmpleado;

        // Formar el nombre de usuario con un separador especial
        const formattedUserName = `_${userName}_`;

        // Obtener la lista de documentos
        const folderPath = path.join(__dirname, 'Doc_firmado');
        fs.readdir(folderPath, async (err, files) => {
            if (err) {
                console.error('Error al leer la carpeta de documentos:', err);
                res.status(500).send('Error al leer la carpeta de documentos');
                return;
            }

            // Filtrar los nombres de archivos para que contengan el nombre de usuario logeado
            const documentos = files.filter(file => file.includes(formattedUserName));

            // Consulta SQL para obtener las fechas de firma de los documentos correspondientes
            const documentosFirmadosQuery = `
                SELECT Nombre_Documento, Fecha_Firma
                FROM Documento
                WHERE Nombre_Documento IN (${documentos.map(doc => `'${doc}'`).join(',')})`;
            const documentosFirmadosRequest = pool.request();
            const documentosFirmadosResult = await documentosFirmadosRequest.query(documentosFirmadosQuery);

            // Convertir el resultado de la consulta a un objeto donde las claves sean los nombres de documento
            const documentosFirmados = {};
            documentosFirmadosResult.recordset.forEach(doc => {
                documentosFirmados[doc.Nombre_Documento] = doc.Fecha_Firma;
                console.log(`Documento: ${doc.Nombre_Documento}, Fecha de Firma: ${doc.Fecha_Firma}`);
            });

            // Renderizar la vista de documentos y pasar los datos del usuario, la lista de documentos y las fechas de firma a la plantilla
            res.render('documentosF', { user: user, documentos: documentos, fechasFirma: documentosFirmados });
        });
    } catch (error) {
        console.error('Error al obtener el perfil del usuario:', error);
        res.status(500).send('Error interno del servidor');
    }
});


// Ruta GET para mostrar un documento en el navegador
app.get('/documentos/:nombreDocumento', (req, res) => {
    const nombreDocumento = req.params.nombreDocumento;
    const filePath = path.join(__dirname, 'Doc_firmado', `${nombreDocumento}.pdf`);

    // Verificar si el archivo existe
    if (fs.existsSync(filePath)) {
        // Leer el archivo y enviarlo como respuesta
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } else {
        res.status(404).send('Documento no encontrado');
    }
    
});

// Ruta POST para descargar un documento
app.post('/documentos/:nombreDocumento', (req, res) => {
    // Verificar si el usuario está autenticado
    if (!req.session.user) {
        // Si el usuario no está autenticado, redirigirlo al inicio de sesión
        return res.redirect('/login');
    }

    // Obtener el nombre del documento desde los parámetros de la ruta
    const nombreDocumento = req.params.nombreDocumento;

    // Construir la ruta completa del archivo
    const filePath = path.join(__dirname, 'Doc_firmado', nombreDocumento);

    // Verificar si el archivo existe
    if (fs.existsSync(filePath)) {
        // Descargar el archivo adjuntando el encabezado de descarga
        res.download(filePath);
    } else {
        res.status(404).send('Documento no encontrado');
    }
});





// Puerto en el que se ejecutará el servidor
const PORT = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
