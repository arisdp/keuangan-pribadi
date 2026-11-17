const fs = require('fs');
let code = fs.readFileSync('src/components/LoginScreen.tsx', 'utf-8');
const startIdx = code.indexOf('const handleRegisterLocal = (e: React.FormEvent) => {');
const endStr = 'setTimeout(() => {\n      onLoginSuccess(newUser, dataChoice);\n    }, 1500);\n  };';
const endIdx = code.indexOf(endStr, startIdx);
if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `const handleRegisterLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!username.trim() || !fullName.trim() || !password.trim()) {
      setError('Semua kolom pendaftaran wajib diisi.');
      return;
    }
    if (username.length < 3) {
      setError('Username minimal terdiri dari 3 karakter.');
      return;
    }
    if (password.length < 4) {
      setError('Password minimal terdiri dari 4 karakter.');
      return;
    }
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, fullName: fullName.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Pendaftaran gagal.');
        return;
      }
      setSuccess('Pendaftaran berhasil! Menyusun ruang kerja keuangan baru...');
      setTimeout(() => {
        onLoginSuccess({
          username: data.user.username,
          fullName: data.user.fullName,
          uid: data.user.id,
          isPremium: true
        }, dataChoice);
      }, 1500);
    } catch (err) {
      setError('Terjadi kesalahan jaringan.');
    }
  };`;
  code = code.substring(0, startIdx) + replacement + code.substring(endIdx + endStr.length);
  fs.writeFileSync('src/components/LoginScreen.tsx', code);
  console.log('patched successfully');
} else {
  console.log('not found');
}
