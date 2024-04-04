import dotenv from 'dotenv';
dotenv.config(); //para acceder a los parámetros de process.env

import sql from 'mssql';

const dbsettings = {    
    user: "ssa_yhermosilla",
    password:"97kZ#5Vd",
    server: "elvis",
    port: 1433,
    database:"BD_Firma_Digital",
    options: {
        database:"BD_Firma_Digital",
        encrypt: true,
        trustServerCertificate: true,
        cryptoCredentialsDetails: {
            ciphers: 'DEFAULT@SECLEVEL=0',
        },
    },
    connectionTimeout: 30000,
};

async function getConnection() {

    try {
        const pool = await sql.connect(dbsettings);
        if (pool) {
            console.log('Conexión exitosa a la base de datos');
        }
        return pool;
    
    } catch (error) {   
        console.log('Error en la conexión a la base de datos', error);
    }
    }
 export { getConnection };