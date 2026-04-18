import { Link } from 'react-router-dom'

function Navbar({ user, onLogout }) {
  return (
    <div style={{ padding: '10px', background: '#eee' }}>
      <Link to="/">Home</Link> |{" "}

      {!user && (
        <>
          <Link to="/login">Login</Link> |{" "}
          <Link to="/register">Registro</Link>
        </>
      )}

      {user && (
        <>
          <Link to="/dashboard">Dashboard</Link> |{" "}
          <button onClick={onLogout}>Logout</button>
        </>
      )}
    </div>
  )
}

export default Navbar