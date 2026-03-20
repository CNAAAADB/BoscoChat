import { useState } from 'react'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  const handleSearch = () => {
    if (!query) return

    const fakeResults = [
      {
        id: 1,
        text: "Don Bosco fundó la congregación salesiana...",
        page: 12,
        doc: "revista_1901.pdf"
      },
      {
        id: 2,
        text: "La educación fue el pilar fundamental...",
        page: 45,
        doc: "historia_salesianos.pdf"
      }
    ]

    setResults(fakeResults)
  }

  // LOGIN SIMPLE
  if (!user) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px' }}>
        <h1>BoscoChat 🔐</h1>
        <p>Debes iniciar sesión para continuar</p>
        <button onClick={() => setUser("usuario")}>
          Iniciar sesión
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px' }}>
      <h1>BoscoChat 📚</h1>

      {/* BUSCADOR */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Buscar documentos históricos..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: '10px', width: '300px' }}
        />
        <button
          onClick={handleSearch}
          style={{ marginLeft: '10px', padding: '10px' }}
        >
          Buscar
        </button>
      </div>

      {/* RESULTADOS */}
      <div>
        {results.length === 0 && <p>No hay resultados</p>}

        {results.map((r) => (
          <div
            key={r.id}
            style={{
              border: '1px solid #ccc',
              padding: '15px',
              marginBottom: '10px'
            }}
          >
            <p>{r.text}</p>
            <small>Página: {r.page}</small>

            <br />

            <a href={`/pdfs/${r.doc}`} target="_blank" rel="noreferrer">
              Ver documento
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App