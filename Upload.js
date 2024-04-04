

// Configuración de almacenamiento para multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'Uploads'); // Directorio donde se guardarán los archivos subidos
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`); // Nombre del archivo: fecha actual + nombre original del archivo
    }
});

const upload = multer({ storage: storage });

// Ruta PUT para manejar la subida de archivos
router.post('/', upload.single('file'), async (req, res) => {
    try {
        // Lee el contenido del archivo
        const fileContent = fs.readFileSync(req.file.path, 'binary', isUtf8);

        // Muestra el contenido del archivo en la consola
        console.log('Contenido del archivo:', fileContent);

        // Convierte el contenido a Base64
        const base64Data = Buffer.from(fileContent, 'binary').toString('base64');

        // Guarda el contenido Base64 en un archivo plano
        fs.writeFileSync('data.txt', base64Data, 'base64');

        // Envía el archivo Base64 como respuesta HTTP
        res.send(base64Data);
    } catch (err) {
        console.error(err);
        
        // Envía una respuesta de error
        res.status(500).send('Error al procesar el archivo.');
    }
});

module.exports = router;