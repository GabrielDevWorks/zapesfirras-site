const pool = require('./db'); // Caminho corrigido
const bcrypt = require('bcrypt');

async function hashPasswords() {
    console.log('Iniciando criptografia de senhas de administradores...');
    let connection;
    try {
        connection = await pool.getConnection();

        const [admins] = await connection.query("SELECT id, password FROM admins WHERE password NOT LIKE '$2b$%'");

        if (admins.length === 0) {
            console.log('Nenhuma senha em texto puro para criptografar. Tudo certo!');
            return;
        }

        console.log(`Encontradas ${admins.length} senhas para criptografar.`);

        const saltRounds = 10;
        for (const admin of admins) {
            console.log(`Criptografando senha para o admin ID: ${admin.id}...`);
            const hashedPassword = await bcrypt.hash(admin.password, saltRounds);

            await connection.query("UPDATE admins SET password = ? WHERE id = ?", [hashedPassword, admin.id]);
            console.log(`Senha do admin ID: ${admin.id} atualizada com sucesso.`);
        }

        console.log('Processo de criptografia finalizado!');

    } catch (error) {
        console.error('Ocorreu um erro:', error);
    } finally {
        if (connection) connection.release();
        pool.end();
    }
}

hashPasswords();