import bcrypt from 'bcryptjs';

const password = 'vLJCUJ';
const hash = '$2b$12$FGQ8rO4Z.xUlO5CKY.XNJuR6vZoJ.a9W1G9l2XU3YrP4d6F8oKWmq';

console.log('パスワード:', password);
console.log('ハッシュ:', hash);

bcrypt.compare(password, hash, (err, result) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('検証結果:', result);
  }
});