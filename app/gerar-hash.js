const bcrypt = require('bcrypt');
const saltRounds = 10;

const senhaParaCriptografar = 'Luane2008@'; 

if (!senhaParaCriptografar) {
    console.log('Por favor, defina uma senha na variável "senhaParaCriptografar".');
    return;
}

console.log('Gerando hash...');
bcrypt.hash(senhaParaCriptografar, saltRounds, function(err, hash) {
    if (err) {
        console.error('Erro ao gerar o hash:', err);
        return;
    }
    console.log('============================================================');
    console.log('Seu hash seguro é:');
    console.log(hash);
    console.log('============================================================');
});