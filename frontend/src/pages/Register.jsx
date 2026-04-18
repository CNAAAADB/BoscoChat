import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)

  const navigate = useNavigate()

  const handleRegister = async () => {
    if (!accepted) {
      alert('Debes aceptar la política de datos')
      return
    }

    await fetch('http://localhost:3000/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    })

    navigate('/login')
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '100px' }}>
      <h2>Registro</h2>

      <input placeholder="Nombre" onChange={(e) => setName(e.target.value)} />
      <br /><br />

      <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <br /><br />

      <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} />

      <br /><br />

      <label>
        <input type="checkbox" onChange={(e) => setAccepted(e.target.checked)} />
        Acepto la política de protección de datos
      </label>

      <br /><br />

      <button onClick={handleRegister}>Registrarse</button>
    </div>
  )
}

export default Register