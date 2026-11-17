const fs = require('fs');
let code = fs.readFileSync('src/components/LoginScreen.tsx', 'utf-8');
const startIdx = code.indexOf('const handleLoginLocal = (e: React.FormEvent) => {');
const endStr = 'onLoginSuccess(foundUser, \'sample\');\n  };';
const endIdx = code.indexOf(endStr, startIdx);
if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `const handleLoginLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Username dan Password wajib diisi.');
      return;
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login gagal.');
        return;
      }
      onLoginSuccess({
        username: data.user.username,
        fullName: data.user.fullName,
        uid: data.user.id,
        isPremium: true
      }, 'sample');
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
