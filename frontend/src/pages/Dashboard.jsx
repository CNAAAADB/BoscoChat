function Dashboard({ user }) {

  const handleChat = () => {
    alert('Funcionalidad no disponible')
  }

  return (
    <div style={{ padding: '40px' }}>
      <h1>Dashboard</h1>

      <p>Bienvenido {user.name}</p>

      <input placeholder="Buscar..." />

      <br /><br />

      <button onClick={handleChat}>
        Abrir chat
      </button>

      <br /><br />

      <button onClick={() => alert(`Email: ${user.email}`)}>
        Ver perfil
      </button>
    </div>
  )
}

export default Dashboard