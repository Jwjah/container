async function testAuth() {
  try {
    console.log('Testing Registration...');
    const regRes = await fetch('http://localhost:5050/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: 'test' + Date.now() + '@example.com',
        password: 'password123',
        role: 'student'
      })
    });
    console.log('Register Status:', regRes.status);
    console.log('Register Data:', await regRes.json());
  } catch (err) {
    console.error('Register Failed:', err.message);
  }

  try {
    console.log('\nTesting Login...');
    const loginRes = await fetch('http://localhost:5050/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'abhishek@nits.ac.in',
        password: 'password'
      })
    });
    console.log('Login Status:', loginRes.status);
    console.log('Login Data:', await loginRes.json());
  } catch (err) {
    console.error('Login Failed:', err.message);
  }
}

testAuth();
